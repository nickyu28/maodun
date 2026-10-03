// 冒烟测试用的 PeerJS 桩：不连任何服务器，永远"连接出错"。
// 同一浏览器的标签页之间靠 BroadcastChannel 互通，足够覆盖消息处理逻辑。
(function () {
    function Peer() {
        var self = this, handlers = {};
        this.id = null;
        this.open = false;
        this.destroyed = false;
        this.on = function (ev, fn) {
            handlers[ev] = fn;
            if (ev === 'error') setTimeout(function () { if (!self.destroyed) fn({ type: 'network', message: 'stub' }); }, 50);
            return self;
        };
        this.connect = function () {
            return { open: false, on: function () { return this; }, send: function () { }, close: function () { } };
        };
        this.call = function () { return null; };
        this.destroy = function () { self.destroyed = true; };
        this.disconnect = function () { };
        this.reconnect = function () { };
    }
    window.Peer = Peer;
})();
