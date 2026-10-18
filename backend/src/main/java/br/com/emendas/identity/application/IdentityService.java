package br.com.emendas.identity.application;

import br.com.emendas.audit.api.AuditTrail;
import br.com.emendas.foundation.api.Page;
import br.com.emendas.foundation.domain.*;
import br.com.emendas.identity.api.BootstrapAdmin;
import br.com.emendas.identity.api.CurrentActor;
import br.com.emendas.identity.api.UserView;
import br.com.emendas.identity.domain.*;
import java.util.*;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class IdentityService implements BootstrapAdmin {
  private final UserStore users;
  private final PasswordEncoder passwords;
  private final AuditTrail audit;
  private final CurrentActor actor;

  public IdentityService(
      UserStore users, PasswordEncoder passwords, AuditTrail audit, CurrentActor actor) {
    this.users = users;
    this.passwords = passwords;
    this.audit = audit;
    this.actor = actor;
  }

  @Transactional
  public void createFirst(String name, String email, String password) {
    users.lockManagement();
    if (!users.all().isEmpty())
      throw DomainException.conflict("O bootstrap só funciona em uma base sem usuários.");
    PasswordPolicy.validate(password);
    var user =
        new UserStore.User(
            UUID.randomUUID(),
            name,
            email.toLowerCase(Locale.ROOT),
            passwords.encode(password),
            Role.ADMIN,
            true,
            true,
            1);
    users.insert(user);
    audit.record(
        new Actor(user.id(), name, "ADMIN"),
        "BOOTSTRAP",
        "user",
        user.id(),
        null,
        user.view(),
        "Primeiro acesso administrativo");
  }

  @PreAuthorize("hasRole('ADMIN')")
  @Transactional(readOnly = true)
  public Page<UserView> list(int offset, int limit) {
    return Page.slice(users.all(), offset, limit);
  }

  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public UserView create(String name, String email, String password, Role role) {
    users.lockManagement();
    PasswordPolicy.validate(password);
    var user =
        new UserStore.User(
            UUID.randomUUID(),
            name,
            email.toLowerCase(Locale.ROOT),
            passwords.encode(password),
            role,
            true,
            true,
            1);
    users.insert(user);
    audit.record(actor.get(), "CREATE", "user", user.id(), null, user.view(), "Cadastro de acesso");
    return user.view();
  }

  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public UserView update(UUID id, Role role, boolean active, long version, String reason) {
    users.lockManagement();
    var old = require(id);
    if (old.version() != version)
      throw DomainException.conflict("O cadastro foi alterado. Atualize a tela.");
    if (old.active()
        && old.role() == Role.ADMIN
        && (!active || role != Role.ADMIN)
        && users.activeAdmins() == 1)
      throw DomainException.conflict("Mantenha pelo menos um administrador ativo.");
    var next =
        new UserStore.User(
            id,
            old.name(),
            old.email(),
            old.hash(),
            role,
            active,
            old.mustChangePassword(),
            version + 1);
    users.update(next);
    audit.record(actor.get(), "UPDATE", "user", id, old.view(), next.view(), reason);
    return next.view();
  }

  @Transactional
  public void changePassword(String oldPassword, String newPassword) {
    var old = require(actor.get().id());
    PasswordPolicy.validate(newPassword);
    if (!passwords.matches(oldPassword, old.hash()))
      throw new DomainException("INVALID_PASSWORD", "Senha atual inválida.", 422);
    if (passwords.matches(newPassword, old.hash()))
      throw DomainException.invalid("Escolha uma senha diferente da atual.");
    var next =
        new UserStore.User(
            old.id(),
            old.name(),
            old.email(),
            passwords.encode(newPassword),
            old.role(),
            old.active(),
            false,
            old.version() + 1);
    users.update(next);
    audit.record(
        actor.get(),
        "PASSWORD_CHANGE",
        "user",
        old.id(),
        old.view(),
        next.view(),
        "Troca de senha; sessões anteriores revogadas");
  }

  @PreAuthorize("hasRole('ADMIN')")
  @Transactional
  public void resetPassword(UUID id, String temporaryPassword, String reason) {
    users.lockManagement();
    var old = require(id);
    PasswordPolicy.validate(temporaryPassword);
    var next =
        new UserStore.User(
            id,
            old.name(),
            old.email(),
            passwords.encode(temporaryPassword),
            old.role(),
            old.active(),
            true,
            old.version() + 1);
    users.update(next);
    audit.record(actor.get(), "PASSWORD_RESET", "user", id, old.view(), next.view(), reason);
  }

  public void checkLogin(String subject) {
    users.checkLogin(subject);
  }

  public void failedLogin(String subject) {
    users.failedLogin(subject);
  }

  public UserView me() {
    return require(actor.get().id()).view();
  }

  private UserStore.User require(UUID id) {
    return users.byId(id).orElseThrow(() -> DomainException.missing("Usuário não encontrado."));
  }
}
