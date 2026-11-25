(function () {
  var script = document.currentScript;
  var params = new URLSearchParams(script ? script.search : location.search);
  var agentId = params.get('agent') || script?.getAttribute('data-agent-id') || '';
  var color = script?.getAttribute('data-color') || '#6d5efc';
  var base = script ? new URL(script.src).origin : location.origin;
  var launcher = document.createElement('button');
  var frame = document.createElement('iframe');
  var open = false;
  launcher.id = 'vd-widget-launcher';
  launcher.type = 'button';
  launcher.setAttribute('aria-label', 'Open support chat');
  launcher.textContent = '💬';
  launcher.style.background = color;
  frame.id = 'vd-widget-frame';
  frame.src = `${base}/public-chat/chat.html?agent=${encodeURIComponent(agentId)}&embed=1`;
  frame.title = 'AI Support Chat';
  frame.style.display = 'none';
  document.body.appendChild(frame);
  document.body.appendChild(launcher);
  function toggle(next) {
    open = typeof next === 'boolean' ? next : !open;
    frame.style.display = open ? 'block' : 'none';
    launcher.textContent = open ? '×' : '💬';
  }
  launcher.addEventListener('click', function () { toggle(); });
  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'josachats:close') toggle(false);
  });
  window.JosaChatsWidget = { open: function () { toggle(true); }, close: function () { toggle(false); }, toggle: toggle };
})();
