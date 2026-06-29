/* ===== boot ===== */
(function () {
  var lite = window.__dcLite;
  var tplText = document.getElementById("dc-template").textContent;
  var tpl = lite.compileTemplate(tplText);
  var Host = lite.makeHost(Component, tpl);
  // editor prop defaults from the original design's data-props
  var props = { accent: "#7A1F2B", serifFont: "Cormorant Garamond", paperGrid: true };
  var mount = document.getElementById("app");
  if (ReactDOM.createRoot) ReactDOM.createRoot(mount).render(React.createElement(Host, props));
  else ReactDOM.render(React.createElement(Host, props), mount);
})();
