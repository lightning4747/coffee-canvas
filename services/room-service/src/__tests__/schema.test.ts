import { buildSchema, printSchema } from 'graphql';
import { typeDefs } from '../schema';

describe('GraphQL Schema', () => {
  it('should be valid GraphQL schema', () => {
    expect(() => {
      buildSchema(printSchema(buildSchema(typeDefs.loc?.source.body || '')));
    }).not.toThrow();
  });

  it('should contain required type definitions', () => {
    const schemaString = typeDefs.loc?.source.body || '';

    // Check for required types in the schema string
    expect(schemaString).toContain('type Query');
    expect(schemaString).toContain('type Mutation');
    expect(schemaString).toContain('type Room');
    expect(schemaString).toContain('type User');
    expect(schemaString).toContain('type AuthPayload');
    expect(schemaString).toContain('type StrokeEvent');
    expect(schemaString).toContain('type CanvasHistoryPage');
  });

  it('should contain required mutations', () => {
    const schemaString = typeDefs.loc?.source.body || '';

    expect(schemaString).toContain('createRoom');
    expect(schemaString).toContain('joinRoom');
  });

  it('should contain required queries', () => {
    const schemaString = typeDefs.loc?.source.body || '';

    expect(schemaString).toContain('getCanvasHistory');
    expect(schemaString).toContain('getRoomInfo');
    expect(schemaString).toContain('healthCheck');
  });

  it('should contain required input types', () => {
    const schemaString = typeDefs.loc?.source.body || '';

    expect(schemaString).toContain('input CreateRoomInput');
    expect(schemaString).toContain('input JoinRoomInput');
    expect(schemaString).toContain('input CanvasHistoryInput');
  });
});
