import { gql } from 'apollo-server-express';

export const typeDefs = gql`
  type Query {
    getCanvasHistory(input: CanvasHistoryInput!): CanvasHistoryPage!
    getRoomInfo(roomId: String!): Room
    healthCheck: Boolean!
  }

  type Mutation {
    createRoom(input: CreateRoomInput!): AuthPayload!
    joinRoom(input: JoinRoomInput!): AuthPayload!
  }

  input CreateRoomInput {
    name: String
    capacity: Int
  }

  input JoinRoomInput {
    code: String!
    displayName: String!
  }

  input CanvasHistoryInput {
    roomId: String!
    chunks: [String!]!
    cursor: String
    limit: Int
  }

  type AuthPayload {
    token: String!
    user: User!
    room: Room!
  }

  type User {
    id: String!
    displayName: String!
    color: String!
    joinedAt: String!
    leftAt: String
  }

  type Room {
    id: String!
    code: String!
    name: String
    capacity: Int!
    createdAt: String!
    participantCount: Int!
  }

  type CanvasHistoryPage {
    events: [StrokeEvent!]!
    cursor: String
    hasMore: Boolean!
  }

  type StrokeEvent {
    id: String!
    roomId: String!
    strokeId: String!
    userId: String!
    eventType: String!
    chunkKey: String!
    data: StrokeEventData!
    createdAt: String!
  }

  type StrokeEventData {
    tool: String
    color: String
    width: Float
    points: [Point2D!]
    stainPolygons: [StainPolygon!]
    strokeMutations: [StrokeMutation!]
  }

  type Point2D {
    x: Float!
    y: Float!
  }

  type StainPolygon {
    id: String!
    path: [Point2D!]!
    opacity: Float!
    color: String!
  }

  type StrokeMutation {
    strokeId: String!
    colorShift: String!
    blurFactor: Float!
    opacityDelta: Float!
  }
`;
