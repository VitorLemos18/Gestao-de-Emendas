package br.com.emendas.identity.adapter.out.persistence;

import br.com.emendas.foundation.domain.DomainException;
import br.com.emendas.identity.api.UserView;
import br.com.emendas.identity.application.UserStore;
import br.com.emendas.identity.domain.Role;
import java.util.*;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;

@Repository
public class PostgresUserStore implements UserStore {
  private final JdbcClient jdbc;

  public PostgresUserStore(JdbcClient jdbc) {
    this.jdbc = jdbc;
  }

  private static final RowMapper<User> MAPPER =
      (r, n) ->
          new User(
              r.getObject("id", UUID.class),
              r.getString("name"),
              r.getString("email"),
              r.getString("password_hash"),
              Role.valueOf(r.getString("role")),
              r.getBoolean("active"),
              r.getBoolean("must_change_password"),
              r.getLong("version"));

  public Optional<User> byEmail(String email) {
    return jdbc.sql("SELECT * FROM identity.users WHERE email=?")
        .param(email)
        .query(MAPPER)
        .optional();
  }

  public Optional<User> byId(UUID id) {
    return jdbc.sql("SELECT * FROM identity.users WHERE id=?").param(id).query(MAPPER).optional();
  }

  public List<UserView> all() {
    return jdbc.sql("SELECT * FROM identity.users ORDER BY name,id").query(MAPPER).list().stream()
        .map(User::view)
        .toList();
  }

  public void lockManagement() {
    jdbc.sql("SELECT pg_advisory_xact_lock(77813420)").query((r, n) -> true).single();
  }

  public long activeAdmins() {
    return jdbc.sql("SELECT count(*) FROM identity.users WHERE active AND role='ADMIN'")
        .query(Long.class)
        .single();
  }

  public void insert(User u) {
    jdbc.sql(
            "INSERT INTO"
                + " identity.users(id,name,email,password_hash,role,active,must_change_password,version)"
                + " VALUES (?,?,?,?,?,?,?,?)")
        .params(
            u.id(),
            u.name(),
            u.email(),
            u.hash(),
            u.role().name(),
            u.active(),
            u.mustChangePassword(),
            u.version())
        .update();
  }

  public void update(User u) {
    int changed =
        jdbc.sql(
                "UPDATE identity.users SET"
                    + " password_hash=?,role=?,active=?,must_change_password=?,version=? WHERE id=?"
                    + " AND version=?")
            .params(
                u.hash(),
                u.role().name(),
                u.active(),
                u.mustChangePassword(),
                u.version(),
                u.id(),
                u.version() - 1)
            .update();
    if (changed != 1) throw DomainException.conflict("Usuário alterado por outra operação.");
  }

  public void checkLogin(String subject) {
    var count =
        jdbc.sql(
                "SELECT failures FROM identity.login_attempts WHERE subject=? AND"
                    + " window_start>now()-interval '15 minutes'")
            .param(subject)
            .query(Integer.class)
            .optional()
            .orElse(0);
    if (count >= 10)
      throw new DomainException(
          "TOO_MANY_ATTEMPTS", "Aguarde 15 minutos para tentar novamente.", 429);
  }

  @Transactional(propagation = Propagation.REQUIRES_NEW)
  public void failedLogin(String subject) {
    jdbc.sql(
            "INSERT INTO identity.login_attempts(subject,failures,window_start) VALUES (?,1,now())"
                + " ON CONFLICT(subject) DO UPDATE SET failures=CASE WHEN"
                + " identity.login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE"
                + " identity.login_attempts.failures+1 END,window_start=CASE WHEN"
                + " identity.login_attempts.window_start<now()-interval '15 minutes' THEN now()"
                + " ELSE identity.login_attempts.window_start END")
        .param(subject)
        .update();
  }
}
