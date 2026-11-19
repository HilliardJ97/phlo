Browser checks against the loopback server (`npm run web` first):

    NODE_PATH=$(npm root -g) node e2e/screens.cjs <output-dir>

Drives the real app with simulated speech (`window.phlo.simulateSpeech`) and saves screenshots of the draft, Room view, Sumi, the Published shelf and the sidebar.
