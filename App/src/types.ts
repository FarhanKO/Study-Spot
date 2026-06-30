export type RoomType = 'lab' | 'class';
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  capacity: number;
  features: string[];
  location: string; // e.g., "Main Building, 3rd Floor"
}

export interface Booking {
  id: string;
  roomId: string;
  day: string; // 'Monday', 'Tuesday', etc.
  startTime: string; // HH:MM (e.g., '08:30')
  endTime: string; // HH:MM (e.g., '10:00')
  subject: string; // e.g., 'CSE 101 Lecture' or 'Empty'
  instructor?: string;
}

// User-contributed occupancy data
export interface RoomOccupancy {
  roomId: string;
  reportedOccupancy: number; // Current occupancy level (0 - 100%)
  checkInCount: number; // Total students currently checked in
  lastUpdated: string; // Time string or timestamp
}

export interface RoomVote {
  roomId: string;
  crowdVotes: { low: number; medium: number; high: number };
  pcVotes?: { good: number; medium: number; poor: number }; // for labs
  sizeVotes?: { spacious: number; standard: number; cramped: number }; // for classes
}

// Result item for active room status
export interface RoomStatusResult {
  room: Room;
  isFreeNow: boolean;
  currentBooking: Booking | null;
  nextBooking: Booking | null;
  freeUntil: string | null; // HH:MM if free, or 'End of Day'
  freeDurationMinutes: number; // How many minutes remains free
  nextAvailableTime: string | null; // When it will become free next if occupied
  occupancyPercentage: number; // predicted or calculated occupancy
  checkIns: number;
  crowdStatus?: 'Low' | 'Medium' | 'High';
  pcStatus?: 'Very Good' | 'Medium' | 'Not Good'; // for labs
  sizeStatus?: 'Spacious' | 'Standard' | 'Cramped'; // for classes
  crowdnessReason?: string; // smart explanation based on floor and schedules
}
