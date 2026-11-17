/* ارتباط با سرور */
'use strict';
const Net = {
  ws: null, on: {},
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onmessage = (e) => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (this.on[m.t]) this.on[m.t](m);
    };
    this.ws.onclose = () => { if (this.on.close) this.on.close(); };
    this.ws.onerror = () => {};
  },
  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
};
