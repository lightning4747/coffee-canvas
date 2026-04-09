import React from 'react';
import { render, act } from '@testing-library/react';
import { Canvas } from '../components/Canvas/Canvas';
import { useCanvas } from '../hooks/useCanvas';
import { useSocket } from '../store/SocketContext';
import { StrokeRenderer } from '../components/Canvas/renderers/StrokeRenderer';
import { useStore } from '../store/useStore';
import * as PIXI from 'pixi.js';

// Mocks
jest.mock('../hooks/useCanvas');
jest.mock('../store/SocketContext');
jest.mock('../store/useStore');
jest.mock('../components/Canvas/renderers/StrokeRenderer');
jest.mock('@shared/utils', () => ({
  generateId: (prefix: string) => `${prefix}_mock_id`,
}));
jest.mock('../components/Canvas/renderers/StainRenderer');
jest.mock('pixi.js', () => ({
  Application: jest.fn().mockImplementation(() => ({
    stage: { addChild: jest.fn() },
    view: document.createElement('canvas'),
    renderer: { resize: jest.fn() },
    destroy: jest.fn(),
  })),
  Graphics: jest.fn().mockImplementation(() => ({
    addChild: jest.fn(),
    clear: jest.fn(),
    beginFill: jest.fn(),
    drawRect: jest.fn(),
    endFill: jest.fn(),
    position: { set: jest.fn() },
    scale: { set: jest.fn() },
  })),
  Container: jest.fn().mockImplementation(() => ({
    addChild: jest.fn(),
    position: { set: jest.fn() },
    scale: { set: jest.fn() },
    name: '',
  })),
  BLEND_MODES: {
    DST_OUT: 'dst_out',
  },
}));

describe('Task 8.5: Real-time Communication Integration', () => {
  let mockSocket: any;
  let mockWorldContainer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
    };

    mockWorldContainer = new PIXI.Container();

    (useCanvas as unknown as jest.Mock).mockReturnValue({
      canvasRef: { current: null },
      worldContainer: mockWorldContainer,
      pixiApp: new PIXI.Application(),
    });

    (useSocket as unknown as jest.Mock).mockReturnValue({
      socket: mockSocket,
      isConnected: true,
      emitStrokeBegin: jest.fn(),
      emitStrokeSegment: jest.fn(),
      emitStrokeEnd: jest.fn(),
      emitCoffeePour: jest.fn(),
    });

    (useStore as unknown as jest.Mock).mockReturnValue({
      viewport: { x: 0, y: 0, zoom: 1 },
      activeTool: 'pen',
      brushSettings: { color: '#000', width: 2 },
    });

    (StrokeRenderer.createGraphics as unknown as jest.Mock).mockReturnValue(
      new PIXI.Graphics()
    );
  });

  it('should render remote strokes when receiving socket events', () => {
    render(<Canvas />);

    // Get the stroke_begin handler
    const onCall = mockSocket.on.mock.calls.find(
      (call: any) => call[0] === 'stroke_begin'
    );
    const handleStrokeBegin = onCall[1];

    const segmentCall = mockSocket.on.mock.calls.find(
      (call: any) => call[0] === 'stroke_segment'
    );
    const handleStrokeSegment = segmentCall[1];

    // 1. Simulate remote stroke_begin
    act(() => {
      handleStrokeBegin({
        strokeId: 'remote-1',
        userId: 'user-2',
        roomId: 'room-1',
        tool: 'pen',
        color: '#ff0000',
        width: 5,
        timestamp: Date.now(),
      });
    });

    // Verify graphics created and added to stage
    expect(StrokeRenderer.createGraphics).toHaveBeenCalled();
    // In our mock, drawingLayer.addChild should be called.
    // Since Canvas creates the drawingLayer internaly, we need to check the worldContainer.
    expect(mockWorldContainer.addChild).toHaveBeenCalled();

    // 2. Simulate remote stroke_segment
    act(() => {
      handleStrokeSegment({
        strokeId: 'remote-1',
        userId: 'user-2',
        roomId: 'room-1',
        points: [{ x: 10, y: 10 }],
        timestamp: Date.now(),
      });
    });

    // Verify renderer was called for the remote stroke
    expect(StrokeRenderer.render).toHaveBeenCalledWith(
      expect.anything(),
      [{ x: 10, y: 10 }],
      expect.objectContaining({ color: '#ff0000', width: 5 })
    );
  });
});
