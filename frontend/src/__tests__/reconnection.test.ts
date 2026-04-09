import { renderHook, act } from '@testing-library/react';
import { SocketProvider, useSocket } from '../store/SocketContext';
import { useStore } from '../store/useStore';
import { io } from 'socket.io-client';
import fc from 'fast-check';

// Mock socket.io-client
jest.mock('socket.io-client');
const mockIo = io as jest.MockedFunction<typeof io>;

// Mock the store
jest.mock('../store/useStore', () => ({
  useStore: jest.fn(),
}));

describe('Property 12: Reconnection and Recovery', () => {
  let mockSocket: any;
  const mockSetRoomInfo = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };

    mockIo.mockReturnValue(mockSocket);

    (useStore as any).mockReturnValue({
      roomId: 'test-room',
      userId: 'test-user',
      setRoomInfo: mockSetRoomInfo,
    });
  });

  it('should buffer events when offline and flush them in order upon reconnection', async () => {
    const { result } = renderHook(() => useSocket(), {
      wrapper: SocketProvider,
    });

    // Simulate connection
    const onCall = mockSocket.on.mock.calls.find(
      (call: any) => call[0] === 'connect'
    );
    const connectHandler = onCall[1];

    // 1. Start online
    act(() => {
      connectHandler();
    });
    const disconnectCall = mockSocket.on.mock.calls.find(
      (call: any) => call[0] === 'disconnect'
    );
    const disconnectHandler = disconnectCall[1];

    // 3. Property: Generated sequence of drawing operations
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            type: fc.constantFrom('begin', 'segment', 'end'),
            strokeId: fc.uuid(),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        async ops => {
          // Ensure offline for each run
          act(() => {
            disconnectHandler();
          });

          mockSocket.emit.mockClear();

          // Perform operations while offline
          act(() => {
            ops.forEach(op => {
              if (op.type === 'begin') {
                result.current.emitStrokeBegin({
                  strokeId: op.strokeId,
                  tool: 'pen',
                  color: '#000',
                  width: 1,
                });
              } else if (op.type === 'segment') {
                result.current.emitStrokeSegment({
                  strokeId: op.strokeId,
                  points: [{ x: 0, y: 0 }],
                });
              } else {
                result.current.emitStrokeEnd({ strokeId: op.strokeId });
              }
            });
          });

          // Ensure nothing emitted yet
          expect(mockSocket.emit).not.toHaveBeenCalled();

          // 4. Reconnect
          act(() => {
            connectHandler();
          });

          // 5. Verify all events emitted in the correct order
          expect(mockSocket.emit).toHaveBeenCalledTimes(ops.length);
          ops.forEach((op, index) => {
            const emitCall = mockSocket.emit.mock.calls[index];
            expect(emitCall[0]).toBe(`stroke_${op.type}`);
            expect(emitCall[1].strokeId).toBe(op.strokeId);
          });
        }
      )
    );
  });
});
