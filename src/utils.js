const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

export const esc = (s) => String(s).replace(/[&<>]/g, c => HTML_ENTITIES[c]);
