export interface Room {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface JoinRoomResponse {
  room_id: string;
  room_code: string;
  session_token: string;
  display_name: string;
  sfu_transport_token: string;
  ice_servers: RTCConfiguration['iceServers'];
}

export async function createRoom(name?: string): Promise<Room> {
  const res = await fetch('/api/v1/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name || 'Anonymous Meeting' }),
  });
  if (!res.ok) {
    throw new Error('Failed to create room');
  }
  return res.json();
}

export async function getRoom(code: string): Promise<Room> {
  const res = await fetch(`/api/v1/rooms/${code}`);
  if (!res.ok) {
    throw new Error('Room not found or inactive');
  }
  return res.json();
}

export async function joinRoom(code: string, displayName: string): Promise<JoinRoomResponse> {
  const res = await fetch(`/api/v1/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ display_name: displayName || 'Anonymous Guest' }),
  });
  if (!res.ok) {
    throw new Error('Failed to join room');
  }
  return res.json();
}
