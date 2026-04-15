/**
 * Lightweight GraphQL client for the Room Service.
 * Uses plain fetch — no Apollo Client needed for two simple mutations.
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_ROOM_SERVICE_URL || 'http://localhost:3002';
const ROOM_SERVICE_URL = BASE_URL.endsWith('/graphql')
  ? BASE_URL
  : `${BASE_URL}/graphql`;

// ---------------------------------------------------------------------------
// Shared types (mirrors the Room Service GraphQL schema)
// ---------------------------------------------------------------------------

export interface RoomUser {
  id: string;
  displayName: string;
  color: string;
  joinedAt: string;
}

export interface RoomInfo {
  id: string;
  code: string;
  name?: string;
  capacity: number;
  participantCount: number;
  createdAt: string;
}

export interface AuthPayload {
  token: string;
  user: RoomUser;
  room: RoomInfo;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function gql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(ROOM_SERVICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Room Service HTTP error: ${res.status}`);
  }

  const json = await res.json();
  if (json.errors && json.errors.length > 0) {
    // Prefer the first GraphQL error message
    throw new Error(json.errors[0].message as string);
  }
  return json.data as T;
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

const CREATE_ROOM_MUTATION = `
  mutation CreateRoom($input: CreateRoomInput!) {
    createRoom(input: $input) {
      token
      user {
        id
        displayName
        color
        joinedAt
      }
      room {
        id
        code
        name
        capacity
        participantCount
        createdAt
      }
    }
  }
`;

const JOIN_ROOM_MUTATION = `
  mutation JoinRoom($input: JoinRoomInput!) {
    joinRoom(input: $input) {
      token
      user {
        id
        displayName
        color
        joinedAt
      }
      room {
        id
        code
        name
        capacity
        participantCount
        createdAt
      }
    }
  }
`;

/**
 * Creates a new collaborative room.
 * @param name  Optional human-readable room name
 * @param capacity  Max participants (defaults to 10 on the server)
 */
export async function createRoom(
  name?: string,
  capacity?: number
): Promise<AuthPayload> {
  const data = await gql<{ createRoom: AuthPayload }>(CREATE_ROOM_MUTATION, {
    input: { name: name || null, capacity: capacity ?? 10 },
  });
  return data.createRoom;
}

/**
 * Joins an existing room by its 6-character access code.
 * @param code         The room's short code
 * @param displayName  The anonymous user's chosen display name
 */
export async function joinRoom(
  code: string,
  displayName: string
): Promise<AuthPayload> {
  const data = await gql<{ joinRoom: AuthPayload }>(JOIN_ROOM_MUTATION, {
    input: { code: code.toUpperCase(), displayName },
  });
  return data.joinRoom;
}
