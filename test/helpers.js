'use strict';
// Una "computadora" de prueba: guarda el token de su sesión, como hace el proceso principal.
function client(api, terminal) {
  let token = null;
  return {
    // Los usuarios iniciales deben cambiar su contraseña antes de operar; aquí se "cambia" por la misma.
    login(params) {
      const r = api.login(params, terminal ? { terminal } : undefined);
      token = r.token;
      if (r.user.must_change) api.call(token, 'auth.changePassword', { current: params.password, password: params.password });
    },
    logout() {
      api.logout(token);
      token = null;
    },
    call: (name, params) => api.call(token, name, params),
  };
}

module.exports = { client };
