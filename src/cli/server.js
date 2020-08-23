// TODO: convert server view into a contained blessed component
// TODO: allow component to run inside another tabs (so multiple servers can be run in parallel)
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const TabContainer = require('blessed-tab-container')
const colors = require('colors');

const screen = blessed.screen({
  smartCSR: true,
  title: 'omegga server',
});

// TODO: Ctrl+F search chat/logs
// TODO: Brickadia Logs in a tab
// TODO: Chat Logs in a tab
// TODO: Omegga Logs in a tab
// TODO: interactive player list

screen.enableInput()
screen.key(['C-c'], () => {
  screen.destroy();
  process.exit(0);
});

const grid = new contrib.grid({rows: 4, cols: 3, screen: screen});
const mainPanel = [0, 0, 4, 2];

const logsTab = grid.set(...mainPanel, blessed.element, { content: 'brickadia logs' });
const omeggaTab = grid.set(...mainPanel, blessed.element, { content: 'omegga logs' });
const chatTab = grid.set(...mainPanel, blessed.element, { content: 'player logs' });
// TODO: potential for plugins to add extra tabs

const playersBox = grid.set(0, 2, 4, 1, blessed.box, { label: 'Players', content: 'player list' });

const tabs = [
  {name: 'Logs', panel: logsTab},
  {name: 'Omegga', panel: omeggaTab},
  {name: 'Chat', panel: chatTab},
];

const tabContainer = TabContainer({
  screen,
  tabSeperator: ' | ',
  activeColorFunc: colors.bgBrightBlue.black,
  dirtyColorFunc: colors.underline,
  defaultVisible: tabs[0].name,
  tabs: tabs.map(t => ({
    label: t.name,
    component: t.panel,
  })),
});

tabContainer.setVisibleTab(tabs[0].name);

screen.render();