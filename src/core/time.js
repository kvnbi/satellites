let offsetMs = 0;

export const simulationTime = () => Date.now() + offsetMs;
export const timeOffset = () => offsetMs;
export const setTimeOffset = (minutes) => { offsetMs = minutes * 60000; };
