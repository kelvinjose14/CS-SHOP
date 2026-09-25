'use strict';
// Una "computadora" de prueba: guarda el token de su sesión, como hace el proceso principal.
function client(api, terminal) {
  let token = null;
  return {
    login(params) {
      token = api.login(params, terminal ? { terminal } : undefined).token;
    },
    logout() {
      api.logout(token);
      token = null;
    },
    call: (name, params) => api.call(token, name, params),
  };
}

module.exports = { client };
