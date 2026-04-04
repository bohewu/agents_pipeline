const plugin = {
  id: "agents-pipeline.usage-status",
  async tui(api, options, meta) {
    const mod = await import("./tui.jsx");
    return mod.createUsageStatusTuiPlugin(api, options, meta);
  },
};

export default plugin;
