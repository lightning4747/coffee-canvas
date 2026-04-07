import { useStore } from '../store/useStore';
const initialState = useStore.getState();
describe('useStore', () => {
  beforeEach(() => {
    useStore.setState(initialState);
  });
  it('should have initial state', () => {
    const state = useStore.getState();
    expect(state.activeTool).toBe('pen');
    expect(state.brushSettings.color).toBe('#3d2b1f');
    expect(state.viewport.zoom).toBe(1);
  });
  it('should set active tool', () => {
    useStore.getState().setActiveTool('eraser');
    expect(useStore.getState().activeTool).toBe('eraser');
  });
  it('should update brush settings', () => {
    useStore.getState().setBrushSettings({ color: '#ff0000', width: 15 });
    expect(useStore.getState().brushSettings.color).toBe('#ff0000');
    expect(useStore.getState().brushSettings.width).toBe(15);
  });
  it('should update viewport state', () => {
    useStore.getState().setViewport({ x: 100, y: 100, zoom: 0.5 });
    expect(useStore.getState().viewport.x).toBe(100);
    expect(useStore.getState().viewport.y).toBe(100);
    expect(useStore.getState().viewport.zoom).toBe(0.5);
  });
});
