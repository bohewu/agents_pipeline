const plugin = {
  id: "agents-pipeline.effort-control",
  async tui(api, options, meta) {
    const mod = await import("./tui.jsx");
    return mod.createEffortControlTuiPlugin(api, options, meta);
  }
};

export default plugin;
