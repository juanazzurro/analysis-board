// Entorno mínimo de navegador para probar módulos de la interfaz desde node.
const noop = () => {};
globalThis.window = { api: { onEngineLine: noop, onEngineExit: noop, engineSend: noop, engineStart: async () => true, storeSet: async () => true, storeGet: async () => null, log: noop }, matchMedia: () => ({ matches: false, addEventListener: noop }) };
