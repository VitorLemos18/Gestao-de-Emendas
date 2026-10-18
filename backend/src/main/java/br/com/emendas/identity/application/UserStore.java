package br.com.emendas.identity.application;

import br.com.emendas.identity.api.UserView;
import br.com.emendas.identity.domain.Role;
import java.util.*;

public interface UserStore {
  record User(
      UUID id,
      String name,
      String email,
      String hash,
      Role role,
      boolean active,
      boolean mustChangePassword,
      long version) {
    public UserView view() {
      return new UserView(id, name, email, role.name(), active, mustChangePassword, version);
    }
  }

  Optional<User> byEmail(String email);

  Optional<User> byId(UUID id);

  List<UserView> all();

  void lockManagement();

  long activeAdmins();

  void insert(User user);

  void update(User user);

  void checkLogin(String subject);

  void failedLogin(String subject);
}
