package br.com.emendas.identity.adapter.in.security;

import br.com.emendas.foundation.domain.Actor;
import br.com.emendas.identity.api.*;
import br.com.emendas.identity.application.UserStore;
import java.util.*;
import org.springframework.security.core.*;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Component;

@Component
public class SessionIdentity implements UserDetailsService, CurrentActor, SessionPolicy {
  private final UserStore users;

  public SessionIdentity(UserStore users) {
    this.users = users;
  }

  public UserDetails loadUserByUsername(String email) {
    return new Principal(
        users
            .byEmail(email.toLowerCase(Locale.ROOT))
            .orElseThrow(() -> new UsernameNotFoundException("Acesso inválido.")));
  }

  public Actor get() {
    var principal =
        (Principal) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    return new Actor(principal.id, principal.displayName, principal.role);
  }

  public boolean isCurrent(Authentication auth) {
    if (!(auth.getPrincipal() instanceof Principal p)) return false;
    return users.byId(p.id).map(u -> u.active() && u.version() == p.version).orElse(false);
  }

  public boolean mustChangePassword(Authentication auth) {
    return auth.getPrincipal() instanceof Principal p && p.mustChange;
  }

  public static final class Principal extends User {
    private static final long serialVersionUID = 1L;
    final UUID id;
    final String displayName;
    final String role;
    final long version;
    final boolean mustChange;

    Principal(UserStore.User u) {
      super(
          u.email(),
          u.hash(),
          u.active(),
          true,
          true,
          true,
          List.of(new SimpleGrantedAuthority("ROLE_" + u.role().name())));
      id = u.id();
      displayName = u.name();
      role = u.role().name();
      version = u.version();
      mustChange = u.mustChangePassword();
    }
  }
}
