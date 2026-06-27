import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  Clock, 
  SlidersHorizontal, 
  Users, 
  MapPin, 
  RotateCcw, 
  Upload, 
  BookOpen, 
  ChevronRight, 
  AlertCircle, 
  Sparkles,
  Check,
  Building,
  Info,
  Calendar,
  Layers,
  RefreshCw,
  Sun,
  Moon,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Room, Booking, RoomOccupancy, RoomStatusResult, RoomVote } from './types';
import { INITIAL_ROOMS, INITIAL_BOOKINGS, calculateRoomStatus, timeToMinutes, getFloorFromRoom } from './data';
import { CsvImporter } from './components/CsvImporter';
import { ImportantDatesModal } from './components/ImportantDatesModal';

import { collection, onSnapshot } from 'firebase/firestore';
import { db, getUserId, dbSaveVote, dbSaveCheckIn, DbVote, DbCheckIn } from './lib/firebase';

const BASE_ROOM_VOTES: Record<string, RoomVote> = {
  'lab-cs1': {
    roomId: 'lab-cs1',
    crowdVotes: { low: 2, medium: 1, high: 0 },
    pcVotes: { good: 3, medium: 0, poor: 0 }
  },
  'lab-cs2': {
    roomId: 'lab-cs2',
    crowdVotes: { low: 1, medium: 2, high: 0 },
    pcVotes: { good: 1, medium: 2, poor: 0 }
  },
  'lab-elec': {
    roomId: 'lab-elec',
    crowdVotes: { low: 0, medium: 2, high: 1 },
    pcVotes: { good: 1, medium: 1, poor: 1 }
  },
  'lab-bio': {
    roomId: 'lab-bio',
    crowdVotes: { low: 3, medium: 0, high: 0 },
    pcVotes: { good: 2, medium: 1, poor: 0 }
  },
  'lab-phys': {
    roomId: 'lab-phys',
    crowdVotes: { low: 2, medium: 1, high: 0 },
    pcVotes: { good: 1, medium: 2, poor: 0 }
  },
  'lab-mech': {
    roomId: 'lab-mech',
    crowdVotes: { low: 1, medium: 1, high: 1 },
    pcVotes: { good: 2, medium: 1, poor: 0 }
  },
  'class-lh101': {
    roomId: 'class-lh101',
    crowdVotes: { low: 1, medium: 2, high: 1 },
    sizeVotes: { spacious: 3, standard: 1, cramped: 0 }
  },
  'class-rm201': {
    roomId: 'class-rm201',
    crowdVotes: { low: 2, medium: 1, high: 0 },
    sizeVotes: { spacious: 1, standard: 2, cramped: 0 }
  },
  'class-rm202': {
    roomId: 'class-rm202',
    crowdVotes: { low: 1, medium: 2, high: 0 },
    sizeVotes: { spacious: 0, standard: 3, cramped: 0 }
  },
  'class-rm303': {
    roomId: 'class-rm303',
    crowdVotes: { low: 2, medium: 1, high: 0 },
    sizeVotes: { spacious: 1, standard: 1, cramped: 1 }
  },
  'class-aud-a': {
    roomId: 'class-aud-a',
    crowdVotes: { low: 1, medium: 2, high: 2 },
    sizeVotes: { spacious: 4, standard: 0, cramped: 0 }
  }
};

// Helper functions for parsing the BRAC University public Google Sheet
function mapDayToken(token: string): string | null {
  const t = token.toUpperCase().trim();
  if (t.includes('SUN')) return 'Sunday';
  if (t.includes('MON')) return 'Monday';
  if (t.includes('TUE')) return 'Tuesday';
  if (t.includes('WED')) return 'Wednesday';
  if (t.includes('THU')) return 'Thursday';
  if (t.includes('FRI')) return 'Friday';
  if (t.includes('SAT')) return 'Saturday';
  return null;
}

function parse12HourTime(timeStr: string): string | null {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/^(\d+):(\d+)\s*(AM|PM)$/);
  if (!match) {
    const simpleMatch = cleaned.match(/^(\d+)\s*(AM|PM)$/);
    if (simpleMatch) {
      let hours = parseInt(simpleMatch[1]);
      const ampm = simpleMatch[2];
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;
      return `${String(hours).padStart(2, '0')}:00`;
    }
    return null;
  }
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3];
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addMinutes(timeStr: string, minutesToAdd: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutesToAdd;
  const hours = Math.floor(total / 60) % 24;
  const mins = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

export default function App() {
  // --- Core State ---
  const [rooms, setRooms] = useState<Room[]>(() => {
    const saved = localStorage.getItem('campus_rooms_list');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved rooms', e);
      }
    }
    return INITIAL_ROOMS;
  });
  
  const [bookings, setBookings] = useState<Booking[]>(() => {
    const saved = localStorage.getItem('campus_bookings_schedule');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved schedule', e);
      }
    }
    return INITIAL_BOOKINGS;
  });

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Track check-ins and predicted occupancy locally
  const [occupancyMap, setOccupancyMap] = useState<Record<string, RoomOccupancy>>(() => {
    const saved = localStorage.getItem('campus_occupancy_map');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved occupancies', e);
      }
    }
    return {};
  });

  // Real-time Firestore states
  const [dbVotes, setDbVotes] = useState<DbVote[]>([]);
  const [dbCheckIns, setDbCheckIns] = useState<DbCheckIn[]>([]);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Listen to Firestore changes in real-time
  useEffect(() => {
    const votesQuery = collection(db, 'votes');
    const unsubVotes = onSnapshot(votesQuery, (snapshot) => {
      const votes: DbVote[] = [];
      snapshot.forEach(doc => {
        votes.push(doc.data() as DbVote);
      });
      setDbVotes(votes);
    }, (error) => {
      console.error("Error listening to votes:", error);
    });

    const checkinsQuery = collection(db, 'checkins');
    const unsubCheckins = onSnapshot(checkinsQuery, (snapshot) => {
      const checkins: DbCheckIn[] = [];
      snapshot.forEach(doc => {
        checkins.push(doc.data() as DbCheckIn);
      });
      setDbCheckIns(checkins);
    }, (error) => {
      console.error("Error listening to check-ins:", error);
    });

    return () => {
      unsubVotes();
      unsubCheckins();
    };
  }, []);

  // Timer tick to refresh decay of entries (crowd votes decay in 1 hour; other items decay in 2 hours)
  useEffect(() => {
    const interval = setInterval(() => {
      setNowTick(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Filter dynamic DB entities: crowd votes decay after 1 hour (60 minutes), spec votes decay after 2 hours (120 minutes)
  const activeDbVotes = useMemo(() => {
    const oneHourAgo = nowTick - 60 * 60 * 1000;
    const twoHoursAgo = nowTick - 120 * 60 * 1000;
    return dbVotes.filter(v => {
      if (v.category === 'crowd') {
        return v.timestamp >= oneHourAgo;
      }
      return v.timestamp >= twoHoursAgo;
    });
  }, [dbVotes, nowTick]);

  const activeDbCheckIns = useMemo(() => {
    const twoHoursAgo = nowTick - 120 * 60 * 1000;
    return dbCheckIns.filter(c => c.timestamp >= twoHoursAgo);
  }, [dbCheckIns, nowTick]);

  // Merge active DB votes on top of BASE_ROOM_VOTES dynamically
  const roomVotes = useMemo(() => {
    const merged: Record<string, RoomVote> = JSON.parse(JSON.stringify(BASE_ROOM_VOTES));
    
    activeDbVotes.forEach(vote => {
      const { roomId, category, value } = vote;
      if (!merged[roomId]) {
        merged[roomId] = {
          roomId,
          crowdVotes: { low: 0, medium: 0, high: 0 }
        };
      }
      
      const rVote = merged[roomId];
      
      if (category === 'crowd') {
        if (!rVote.crowdVotes) rVote.crowdVotes = { low: 0, medium: 0, high: 0 };
        if (value === 'low') rVote.crowdVotes.low++;
        if (value === 'medium') rVote.crowdVotes.medium++;
        if (value === 'high') rVote.crowdVotes.high++;
      } else if (category === 'spec') {
        const roomObj = rooms.find(r => r.id === roomId);
        const isLab = roomObj?.type === 'lab';
        
        if (isLab) {
          if (!rVote.pcVotes) rVote.pcVotes = { good: 0, medium: 0, poor: 0 };
          if (value === 'good') rVote.pcVotes.good++;
          if (value === 'medium') rVote.pcVotes.medium++;
          if (value === 'poor') rVote.pcVotes.poor++;
        } else {
          if (!rVote.sizeVotes) rVote.sizeVotes = { spacious: 0, standard: 0, cramped: 0 };
          if (value === 'spacious') rVote.sizeVotes.spacious++;
          if (value === 'standard') rVote.sizeVotes.standard++;
          if (value === 'cramped') rVote.sizeVotes.cramped++;
        }
      }
    });
    
    return merged;
  }, [rooms, activeDbVotes]);

  // Derived user votes
  const userVotes = useMemo(() => {
    const userId = getUserId();
    const mapped: Record<string, { crowd?: 'low' | 'medium' | 'high'; spec?: string }> = {};
    
    activeDbVotes.forEach(vote => {
      if (vote.userId === userId) {
        if (!mapped[vote.roomId]) {
          mapped[vote.roomId] = {};
        }
        if (vote.category === 'crowd') {
          mapped[vote.roomId].crowd = vote.value as 'low' | 'medium' | 'high';
        } else {
          mapped[vote.roomId].spec = vote.value;
        }
      }
    });
    
    return mapped;
  }, [activeDbVotes]);

  // Derived user check-ins
  const userCheckIns = useMemo(() => {
    const userId = getUserId();
    const mapped: Record<string, boolean> = {};
    activeDbCheckIns.forEach(c => {
      if (c.userId === userId) {
        mapped[c.roomId] = true;
      }
    });
    return mapped;
  }, [activeDbCheckIns]);

  // Merge database check-ins into occupancyMap dynamically
  const computedOccupancyMap = useMemo(() => {
    const baseMap = { ...occupancyMap };
    
    // Reset checkInCounts of all rooms in baseMap first to ensure clean sync with Firestore
    Object.keys(baseMap).forEach(key => {
      baseMap[key] = {
        ...baseMap[key],
        checkInCount: 0
      };
    });

    const checkInCounts: Record<string, number> = {};
    activeDbCheckIns.forEach(c => {
      checkInCounts[c.roomId] = (checkInCounts[c.roomId] || 0) + 1;
    });
    
    rooms.forEach(room => {
      const dbCount = checkInCounts[room.id] || 0;
      if (!baseMap[room.id]) {
        baseMap[room.id] = {
          roomId: room.id,
          reportedOccupancy: 10,
          checkInCount: dbCount,
          lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
      } else {
        baseMap[room.id] = {
          ...baseMap[room.id],
          checkInCount: dbCount
        };
      }
    });
    
    return baseMap;
  }, [rooms, occupancyMap, activeDbCheckIns]);

  const [feedbackHidden, setFeedbackHidden] = useState<Record<string, boolean>>({});
  const [feedbackSuccess, setFeedbackSuccess] = useState<Record<string, string>>({});
  const feedbackTimeouts = useRef<Record<string, any>>({});

  // Sorting freezing state to prevent list shuffling while voting/checking in
  const [frozenRoomIds, setFrozenRoomIds] = useState<string[] | null>(null);
  const freezeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Simulated Time Traveler Variables ---
  // Default to real system time at load
  const [simulatedDay, setSimulatedDay] = useState<string>(() => {
    const now = new Date();
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[now.getDay()];
  });
  const [simulatedTime, setSimulatedTime] = useState<string>(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${mins}`;
  });
  const [simulatedMonth, setSimulatedMonth] = useState<number>(() => {
    return new Date().getMonth(); // 0-indexed: 0 = Jan, 1 = Feb, ..., 5 = June
  });
  const [hasManuallyOverridden, setHasManuallyOverridden] = useState<boolean>(false);

  // --- Filter and Search Criteria State ---
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roomTypeTab, setRoomTypeTab] = useState<'lab' | 'class'>('lab');
  const [minDurationFilter, setMinDurationFilter] = useState<number>(30); // in minutes
  const [sortByOccupancy, setSortByOccupancy] = useState<boolean>(true); // optimizing campus study space usage
  const [onlyAvailableNow, setOnlyAvailableNow] = useState<boolean>(true);

  // --- Modal Open State ---
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [isImportantDatesOpen, setIsImportantDatesOpen] = useState<boolean>(false);
  const [importantDatesTab, setImportantDatesTab] = useState<'dates' | 'holidays' | 'scanner'>('dates');
  const [selectedRoomSchedule, setSelectedRoomSchedule] = useState<string | null>(null);
  const [isClockPickerOpen, setIsClockPickerOpen] = useState<boolean>(false);
  const [isDayPickerOpen, setIsDayPickerOpen] = useState<boolean>(false);
  const [clockPickerMode, setClockPickerMode] = useState<'hours' | 'minutes'>('hours');
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 200);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('study_spot_dark_mode') === 'true';
  });

  // --- Toast notifications and Custom Confirms ---
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('study_spot_dark_mode', String(darkMode));
  }, [darkMode]);

  // --- Save persistent variables to LocalStorage on updates ---
  useEffect(() => {
    localStorage.setItem('campus_rooms_list', JSON.stringify(rooms));
  }, [rooms]);

  useEffect(() => {
    localStorage.setItem('campus_bookings_schedule', JSON.stringify(bookings));
  }, [bookings]);

  useEffect(() => {
    localStorage.setItem('campus_occupancy_map', JSON.stringify(occupancyMap));
  }, [occupancyMap]);

  // System time synchronization loop
  useEffect(() => {
    if (hasManuallyOverridden) return;

    const updateTimeToCurrent = () => {
      const now = new Date();
      // Translate JavaScript day (0-6) to standard day name
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDayName = days[now.getDay()];
      
      const hours = String(now.getHours()).padStart(2, '0');
      const mins = String(now.getMinutes()).padStart(2, '0');
      
      setSimulatedDay(currentDayName);
      setSimulatedTime(`${hours}:${mins}`);
      setSimulatedMonth(now.getMonth());
    };

    updateTimeToCurrent();
    const interval = setInterval(updateTimeToCurrent, 15000); // refresh every 15 seconds
    return () => clearInterval(interval);
  }, [hasManuallyOverridden]);

  // Automatically sync BRAC University live schedules on startup
  useEffect(() => {
    handleSyncBRACUniversityLive(true);
  }, []);

  // Clean up freeze timeout on unmount
  useEffect(() => {
    return () => {
      if (freezeTimeoutRef.current) {
        clearTimeout(freezeTimeoutRef.current);
      }
    };
  }, []);

  // --- Calculation Engine ---
  const computedRoomStatuses = useMemo(() => {
    const rawStatuses = calculateRoomStatus(rooms, bookings, computedOccupancyMap, simulatedDay, simulatedTime);
    
    return rawStatuses.map(item => {
      // Get or construct default votes for this room if not exists
      const votes = roomVotes[item.room.id] || {
        roomId: item.room.id,
        crowdVotes: { low: 2, medium: 1, high: 0 },
        pcVotes: item.room.type === 'lab' ? { good: 2, medium: 1, poor: 0 } : undefined,
        sizeVotes: item.room.type === 'class' ? { spacious: 1, standard: 2, cramped: 0 } : undefined
      };

      const userVoteInfo = userVotes[item.room.id];

      // 1. Determine Crowd Status (Low, Medium, High)
      let crowdStatus: 'Low' | 'Medium' | 'High' = 'Medium';
      const cv = votes.crowdVotes || { low: 2, medium: 1, high: 0 };
      const totalCrowdVotes = cv.low + cv.medium + cv.high;
      if (totalCrowdVotes > 0) {
        // low = 1, medium = 2, high = 3
        const avgCrowd = (cv.low * 1 + cv.medium * 2 + cv.high * 3) / totalCrowdVotes;
        if (avgCrowd >= 2.5) {
          crowdStatus = 'High';
        } else if (avgCrowd >= 1.5) {
          crowdStatus = 'Medium';
        } else {
          crowdStatus = 'Low';
        }
      }

      // 2. Determine PC Quality (Lab) via Weighted Average of votes
      let pcStatus: 'Very Good' | 'Medium' | 'Not Good' | undefined;
      if (item.room.type === 'lab') {
        const pcv = votes.pcVotes || { good: 2, medium: 1, poor: 0 };
        const totalPcVotes = pcv.good + pcv.medium + pcv.poor;
        if (totalPcVotes > 0) {
          // good = 3, medium = 2, poor = 1
          const avgPc = (pcv.good * 3 + pcv.medium * 2 + pcv.poor * 1) / totalPcVotes;
          if (avgPc >= 2.5) {
            pcStatus = 'Very Good';
          } else if (avgPc >= 1.5) {
            pcStatus = 'Medium';
          } else {
            pcStatus = 'Not Good';
          }
        } else {
          pcStatus = 'Medium';
        }
      }

      // 3. Determine Classroom Size (Class) via Weighted Average of votes
      let sizeStatus: 'Spacious' | 'Standard' | 'Cramped' | undefined;
      if (item.room.type === 'class') {
        const szv = votes.sizeVotes || { spacious: 1, standard: 2, cramped: 0 };
        const totalSizeVotes = szv.spacious + szv.standard + szv.cramped;
        if (totalSizeVotes > 0) {
          // spacious = 3, standard = 2, cramped = 1
          const avgSize = (szv.spacious * 3 + szv.standard * 2 + szv.cramped * 1) / totalSizeVotes;
          if (avgSize >= 2.5) {
            sizeStatus = 'Spacious';
          } else if (avgSize >= 1.5) {
            sizeStatus = 'Standard';
          } else {
            sizeStatus = 'Cramped';
          }
        } else {
          sizeStatus = 'Standard';
        }
      }

      // 4. Adjust the occupancy percentage (the "Estimated Crowd" bar)
      // We apply a sequential simulation of Low, Medium, High votes to determine the dynamic adjustment
      let adjustedOccupancy = item.occupancyPercentage;
      const numLow = votes.crowdVotes?.low || 0;
      const numMedium = votes.crowdVotes?.medium || 0;
      const numHigh = votes.crowdVotes?.high || 0;

      // Apply Medium votes first
      for (let i = 1; i <= numMedium; i++) {
        const multiplier = Math.max(0, 1.0 - (i - 1) * 0.1);
        let change = 0;
        if (adjustedOccupancy < 35) {
          // If already lower and someone votes moderate, bar rises a bit (5%)
          change = 5;
        } else if (adjustedOccupancy > 65) {
          // If already higher and someone votes moderate, bar shrinks a bit (5%)
          change = -5;
        } else {
          // If already in moderate, voting moderate keeps it as is
          change = 0;
        }
        adjustedOccupancy += change * multiplier;
      }

      // Apply Low votes
      for (let i = 1; i <= numLow; i++) {
        const multiplier = Math.max(0, 1.0 - (i - 1) * 0.1);
        let change = 0;
        if (adjustedOccupancy < 35) {
          // If already lower and someone votes low, it wont be lower
          change = 0;
        } else if (adjustedOccupancy > 65) {
          // If high and someone votes low, bar will shrink much (15%)
          change = -15;
        } else {
          // If in moderate, press low and it will be lower a bit (5%)
          change = -5;
        }
        adjustedOccupancy += change * multiplier;
      }

      // Apply High votes
      for (let i = 1; i <= numHigh; i++) {
        const multiplier = Math.max(0, 1.0 - (i - 1) * 0.1);
        let change = 0;
        if (adjustedOccupancy < 35) {
          // If already lower and someone votes high, it will rise a lot more (10%)
          change = 10;
        } else if (adjustedOccupancy > 65) {
          // If already higher and someone votes high, it wont be higher
          change = 0;
        } else {
          // If in moderate, press high and it will rise more a bit (5%)
          change = 5;
        }
        adjustedOccupancy += change * multiplier;
      }

      // Keep within realistic bounds depending on free/booked status
      if (!item.isFreeNow) {
        if (adjustedOccupancy > 98) adjustedOccupancy = 98;
        if (adjustedOccupancy < 70) adjustedOccupancy = 70;
      } else {
        if (adjustedOccupancy > 74) adjustedOccupancy = 74;
        if (adjustedOccupancy < 2) adjustedOccupancy = 2;
      }

      return {
        ...item,
        occupancyPercentage: Math.round(adjustedOccupancy),
        crowdStatus,
        pcStatus,
        sizeStatus
      };
    });
  }, [rooms, bookings, computedOccupancyMap, simulatedDay, simulatedTime, roomVotes, userVotes]);

  // Automatically switch room type tab when searching for a specific room name/ID
  useEffect(() => {
    const rawQuery = searchQuery.trim();
    if (rawQuery) {
      const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanQuery = normalize(rawQuery);
      if (cleanQuery.length >= 2) {
        const matchingRoom = computedRoomStatuses.find(item => {
          const cleanRoomName = normalize(item.room.name);
          const cleanRoomId = normalize(item.room.id);
          return (
            cleanRoomName === cleanQuery ||
            cleanRoomName.includes(cleanQuery) ||
            cleanQuery.includes(cleanRoomName) ||
            cleanRoomId === cleanQuery ||
            cleanRoomId.includes(cleanQuery)
          );
        });
        if (matchingRoom && matchingRoom.room.type !== roomTypeTab) {
          setRoomTypeTab(matchingRoom.room.type);
        }
      }
    }
  }, [searchQuery, computedRoomStatuses, roomTypeTab]);

  const isHolidaySearchedOrActive = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const isFriday = simulatedDay === 'Friday';
    const holidayKeywords = [
      'holiday', 'vacation', 'closure', 'eid', 'puja', 'shab', 'independence', 
      'victory', 'christmas', 'bengali new year', 'pohela boishakh', 'may day',
      'buddha purnima', 'ashura', 'janmashtami', 'mourning day', 'shaheed', 'mother language'
    ];
    return isFriday || holidayKeywords.some(keyword => query.includes(keyword));
  }, [simulatedDay, searchQuery]);

  const isNightTimeClosed = useMemo(() => {
    if (!simulatedTime) return false;
    const [hourStr, minStr] = simulatedTime.split(':');
    const hours = parseInt(hourStr, 10);
    const minutes = parseInt(minStr, 10);
    const totalMinutes = hours * 60 + minutes;
    
    // 9:30 pm is 21:30 -> 21 * 60 + 30 = 1290 minutes
    // 8:30 am is 08:30 -> 8 * 60 + 30 = 510 minutes
    return totalMinutes >= 1290 || totalMinutes < 510;
  }, [simulatedTime]);

  // --- Filter and Sorting Execution ---
  const processedRoomsList = useMemo(() => {
    let list = [...computedRoomStatuses];

    const rawQuery = searchQuery.trim();
    const matchedRoomIds = new Set<string>();

    if (rawQuery) {
      // Helper to normalize strings for comparison: lowercase and strip non-alphanumeric (hyphens, spaces, etc.)
      const normalize = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const cleanQuery = normalize(rawQuery);

      if (cleanQuery.length >= 2) {
        list.forEach(item => {
          const cleanRoomName = normalize(item.room.name);
          const cleanRoomId = normalize(item.room.id);
          // If the clean query exactly matches or is contained within the clean room name or id
          if (
            cleanRoomName === cleanQuery ||
            cleanRoomName.includes(cleanQuery) ||
            cleanQuery.includes(cleanRoomName) ||
            cleanRoomId === cleanQuery ||
            cleanRoomId.includes(cleanQuery)
          ) {
            matchedRoomIds.add(item.room.id);
          }
        });
      }
    }

    // Filter by selection
    list = list.filter(item => {
      // Rule: If a room was explicitly matched/provided via the search box, show it REGARDLESS of other filters!
      if (matchedRoomIds.has(item.room.id)) {
        return true;
      }

      // Otherwise, evaluate regular filters
      
      // Filter by Lab or Class selection
      if (roomTypeTab !== 'all') {
        if (item.room.type !== roomTypeTab) return false;
      }

      // Filter by active text Search query (Room Name features or Location)
      if (rawQuery) {
        const query = rawQuery.toLowerCase();
        const matchesSearch = 
          item.room.name.toLowerCase().includes(query) ||
          item.room.location.toLowerCase().includes(query) ||
          item.room.features.some(f => f.toLowerCase().includes(query)) ||
          (item.currentBooking && item.currentBooking.subject.toLowerCase().includes(query));
        
        if (!matchesSearch) return false;
      }

      // Filter by Duration Slider (Only applies if room is free now)
      if (minDurationFilter > 0) {
        if (item.isFreeNow && item.freeDurationMinutes < minDurationFilter) {
          return false;
        }
      }

      // Filter by Availability Now checkbox
      if (onlyAvailableNow) {
        if (!item.isFreeNow) return false;
      }

      return true;
    });

    // --- Dynamic Sort Strategy ---
    const isRoomFT = (room: Room) => {
      const id = room.id.toLowerCase();
      const name = room.name.toLowerCase();
      const loc = room.location.toLowerCase();
      return id.includes('ft') || name.includes('ft') || loc.includes('ft') || loc.includes('front tower');
    };

    if (frozenRoomIds) {
      const idToIndex = new Map(frozenRoomIds.map((id, index) => [id, index]));
      list.sort((a, b) => {
        const indexA = idToIndex.get(a.room.id);
        const indexB = idToIndex.get(b.room.id);
        if (indexA !== undefined && indexB !== undefined) {
          return (indexA as number) - (indexB as number);
        }
        if (indexA !== undefined) return -1;
        if (indexB !== undefined) return 1;
        return 0;
      });
    } else {
      list.sort((a, b) => {
        // If one of the rooms is an explicit name match and the other is not, put matched room on top!
        const aMatched = matchedRoomIds.has(a.room.id);
        const bMatched = matchedRoomIds.has(b.room.id);
        if (aMatched !== bMatched) {
          return aMatched ? -1 : 1;
        }

        // Check FT status: "And put FT in the bottom"
        const aIsFT = isRoomFT(a.room);
        const bIsFT = isRoomFT(b.room);
        if (aIsFT !== bIsFT) {
          return aIsFT ? 1 : -1; // FT goes to bottom
        }

        // Sort by Floor Number from lowest to highest
        const aFloor = getFloorFromRoom(a.room);
        const bFloor = getFloorFromRoom(b.room);
        if (aFloor !== bFloor) {
          return aFloor - bFloor;
        }

        // 1. Available rooms always bubble to top within same floor / FT group!
        if (a.isFreeNow !== b.isFreeNow) {
          return a.isFreeNow ? -1 : 1;
        }

        // 2. Sort by Occupancy optimization (least occupied free spaces bubble up) within same floor / FT group
        if (sortByOccupancy) {
          // Less occupied rooms shown first to help users optimize space usage
          // But exclude user's own check-in from pushing the room down!
          const aEffectiveOcc = a.occupancyPercentage - (userCheckIns[a.room.id] ? 3 : 0);
          const bEffectiveOcc = b.occupancyPercentage - (userCheckIns[b.room.id] ? 3 : 0);
          return aEffectiveOcc - bEffectiveOcc;
        }

        // 3. Fallback sort alphabetically within same floor / FT group
        return a.room.name.localeCompare(b.room.name);
      });
    }

    return list;
  }, [computedRoomStatuses, roomTypeTab, searchQuery, minDurationFilter, onlyAvailableNow, sortByOccupancy, userCheckIns, frozenRoomIds]);

  // --- Handlers ---
  const triggerSortingFreeze = () => {
    setFrozenRoomIds(prev => {
      if (prev) return prev;
      return processedRoomsList.map(item => item.room.id);
    });
    if (freezeTimeoutRef.current) {
      clearTimeout(freezeTimeoutRef.current);
    }
    freezeTimeoutRef.current = setTimeout(() => {
      setFrozenRoomIds(null);
    }, 5000);
  };

  const handleCheckInToggle = (roomId: string) => {
    // Freeze room list sorting during active interaction (for 5 seconds)
    triggerSortingFreeze();

    const isCurrentlyCheckedIn = !!userCheckIns[roomId];
    
    // Reset feedback states for the room
    setFeedbackHidden(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    setFeedbackSuccess(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });

    if (isCurrentlyCheckedIn) {
      dbSaveCheckIn(null).catch(err => {
        console.error("Failed to clear check-in:", err);
        showToast("Error clearing check-in", "error");
      });
    } else {
      dbSaveCheckIn(roomId).catch(err => {
        console.error("Failed to save check-in:", err);
        showToast("Error saving check-in", "error");
      });
    }
  };

  const handleVote = (roomId: string, category: 'crowd' | 'spec', value: string) => {
    // Freeze room list sorting during active interaction (for 5 seconds)
    triggerSortingFreeze();

    const currentVote = userVotes[roomId]?.[category];

    if (currentVote === value) {
      // User is undoing their vote!
      dbSaveVote(roomId, category, undefined).catch(err => {
        console.error("Failed to clear vote:", err);
        showToast("Error clearing vote", "error");
      });
    } else {
      // Cast vote
      dbSaveVote(roomId, category, value).catch(err => {
        console.error("Failed to save vote:", err);
        showToast("Error saving vote", "error");
      });
    }

    // Trigger feedback close timer (smoothly slides up/hides in 3 seconds)
    if (feedbackTimeouts.current[roomId]) {
      clearTimeout(feedbackTimeouts.current[roomId]);
    }

    feedbackTimeouts.current[roomId] = setTimeout(() => {
      setFeedbackHidden(prev => ({
        ...prev,
        [roomId]: true
      }));
    }, 3000);
  };

  const handleImportSchedule = (newBookings: Booking[], newRooms?: Room[]) => {
    if (newRooms && newRooms.length > 0) {
      setRooms(newRooms);
    } else {
      // Fallback: derive rooms if they were somehow not passed
      const derivedRoomsMap = new Map<string, Room>();
      newBookings.forEach(b => {
        const roomId = b.roomId;
        if (!derivedRoomsMap.has(roomId)) {
          const isLab = b.subject.toLowerCase().includes('lab');
          const roomName = roomId.toUpperCase().replace(/-/g, ' ');
          derivedRoomsMap.set(roomId, {
            id: roomId,
            name: roomName,
            type: isLab ? 'lab' : 'class',
            capacity: isLab ? 35 : 40,
            features: isLab ? ['Lab Computers', 'AC', 'Whiteboard'] : ['Projector', 'Whiteboard', 'AC'],
            location: roomName.trim().toUpperCase().startsWith('FT') ? 'FT Building' : 'Campus Building'
          });
        }
      });
      if (derivedRoomsMap.size > 0) {
        setRooms(Array.from(derivedRoomsMap.values()));
      }
    }
    setBookings(newBookings);
    setOccupancyMap({});
  };

  const handleSyncBRACUniversityLive = async (silent = false) => {
    setIsSyncing(true);
    setSyncStatus('Fetching public spreadsheet data...');
    try {
      const url = 'https://docs.google.com/spreadsheets/d/1uCpxARIPFmkhL1BdzCL5dXmxO5CbNbFkKrgOCmUM6cA/gviz/tq?tqx=out:json&gid=2069304119';
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Google Sheets responded with HTTP ${res.status}`);
      }
      const text = await res.text();
      
      const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/);
      if (!match) {
        throw new Error('Invalid response format received from Google Sheets API');
      }
      
      const json = JSON.parse(match[1]);
      const rows = json.table?.rows;
      if (!rows || rows.length === 0) {
        throw new Error('The spreadsheet contains no data or could not be read');
      }
      
      setSyncStatus('Parsing classes and discovering campus spaces...');
      
      const parsedBookings: Booking[] = [];
      const detectedRoomsMap = new Map<string, Room>();
      
      // Skip header row
      for (let i = 1; i < rows.length; i++) {
         const c = rows[i].c;
         if (!c) continue;
         
         const getVal = (idx: number) => c[idx] ? c[idx].v : null;
         
         const course = getVal(0);
         const theoryDay = getVal(4);
         const theoryTime = getVal(5);
         const theoryRoom = getVal(6);
         const labFaculty = getVal(7);
         const labDay = getVal(8);
         const labTime = getVal(9);
         const labRoom = getVal(10);
         const instructor = getVal(12) || 'Unknown';
         
         if (!course) continue;
         
         // 1. Process Theory Classes
         if (theoryRoom && theoryDay && theoryTime) {
           const roomName = String(theoryRoom).trim();
           const roomId = roomName.toLowerCase().replace(/\s+/g, '-');
           
           if (!detectedRoomsMap.has(roomId)) {
             detectedRoomsMap.set(roomId, {
               id: roomId,
               name: roomName,
               type: 'class',
               capacity: 40,
               features: ['Projector', 'Whiteboard', 'AC'],
               location: roomName.trim().toUpperCase().startsWith('FT') ? 'FT Building' : 'Campus Building'
             });
           }
           
           const startTime24 = parse12HourTime(String(theoryTime));
           if (startTime24) {
             const endTime24 = addMinutes(startTime24, 80); // 1h 20m
             const days = String(theoryDay).split('+');
             for (const dayToken of days) {
               const mappedDay = mapDayToken(dayToken);
               if (mappedDay) {
                 parsedBookings.push({
                   id: `brac-theory-${i}-${dayToken}`,
                   roomId,
                   day: mappedDay,
                   startTime: startTime24,
                   endTime: endTime24,
                   subject: `${course} (Theory)`,
                   instructor: String(instructor).split('@')[0] || 'Faculty'
                 });
               }
             }
           }
         }
         
         // 2. Process Lab Classes
         if (labRoom && labDay && labTime) {
           const roomName = String(labRoom).trim();
           const roomId = roomName.toLowerCase().replace(/\s+/g, '-');
           
           if (!detectedRoomsMap.has(roomId)) {
             detectedRoomsMap.set(roomId, {
               id: roomId,
               name: roomName,
               type: 'lab',
               capacity: 35,
               features: ['Lab Computers', 'AC', 'Whiteboard'],
               location: roomName.trim().toUpperCase().startsWith('FT') ? 'FT Building' : 'Campus Building'
             });
           }
           
           const startTime24 = parse12HourTime(String(labTime));
           if (startTime24) {
             const endTime24 = addMinutes(startTime24, 180); // 3h
             const days = String(labDay).split('+');
             for (const dayToken of days) {
               const mappedDay = mapDayToken(dayToken);
               if (mappedDay) {
                 parsedBookings.push({
                   id: `brac-lab-${i}-${dayToken}`,
                   roomId,
                   day: mappedDay,
                   startTime: startTime24,
                   endTime: endTime24,
                   subject: `${course} (Lab)`,
                   instructor: String(labFaculty || 'Faculty')
                 });
               }
             }
           }
         }
      }
      
      if (parsedBookings.length === 0 || detectedRoomsMap.size === 0) {
        throw new Error('No valid class slots or rooms could be extracted from this spreadsheet structure.');
      }
      
      const uniqueRooms = Array.from(detectedRoomsMap.values());
      
      // Update states
      setRooms(uniqueRooms);
      setBookings(parsedBookings);
      setOccupancyMap({});
      
      if (!silent) {
        showToast(`Success! Imported ${uniqueRooms.length} unique rooms and ${parsedBookings.length} weekly classes directly from BRAC University's public schedule!`, 'success');
      }
    } catch (err: any) {
      console.error('Failed to sync spreadsheet:', err);
      if (!silent) {
        showToast(`Sync failed: ${err.message || err}. Ensure you are online and try again.`, 'error');
      }
    } finally {
      setIsSyncing(false);
      setSyncStatus(null);
    }
  };

  const handleResetSchedule = () => {
    setConfirmConfig({
      message: 'Are you sure you want to restore the default schedules? This will replace any custom imports.',
      onConfirm: () => {
        setRooms(INITIAL_ROOMS);
        setBookings(INITIAL_BOOKINGS);
        setOccupancyMap({});
        localStorage.removeItem('campus_rooms_list');
        localStorage.removeItem('campus_bookings_schedule');
        localStorage.removeItem('campus_occupancy_map');
        showToast('Successfully restored default schedule templates.', 'info');
      }
    });
  };

  // Helper formatting for duration minutes
  const formatDurationText = (mins: number) => {
    if (mins >= 400) return 'Rest of Day';
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    
    let parts: string[] = [];
    if (hours > 0) parts.push(`${hours} hr${hours > 1 ? 's' : ''}`);
    if (remainingMins > 0) parts.push(`${remainingMins} min${remainingMins > 1 ? 's' : ''}`);
    return parts.length > 0 ? parts.join(' ') : '0 mins';
  };

  // Clock picker parsing variables and selectors
  const [hourStr, minStr] = (simulatedTime || '12:00').split(':');
  const hour24 = parseInt(hourStr || '12', 10);
  const currentMinute = parseInt(minStr || '00', 10);
  const currentPeriod = hour24 >= 12 ? 'PM' : 'AM';
  const currentHour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const handleHourSelect = (h12: number) => {
    let h24 = h12;
    if (currentPeriod === 'PM' && h12 < 12) {
      h24 = h12 + 12;
    } else if (currentPeriod === 'AM' && h12 === 12) {
      h24 = 0;
    }
    const hoursStr = String(h24).padStart(2, '0');
    const minsStr = String(currentMinute).padStart(2, '0');
    setSimulatedTime(`${hoursStr}:${minsStr}`);
    setHasManuallyOverridden(true);
    setClockPickerMode('minutes');
  };

  const handleMinuteSelect = (m: number) => {
    const hoursStr = String(hour24).padStart(2, '0');
    const minsStr = String(m).padStart(2, '0');
    setSimulatedTime(`${hoursStr}:${minsStr}`);
    setHasManuallyOverridden(true);
  };

  const handlePeriodSelect = (p: 'AM' | 'PM') => {
    if (p === currentPeriod) return;
    let h24 = hour24;
    if (p === 'PM' && hour24 < 12) {
      h24 = hour24 + 12;
    } else if (p === 'AM' && hour24 >= 12) {
      h24 = hour24 - 12;
    }
    const hoursStr = String(h24).padStart(2, '0');
    const minsStr = String(currentMinute).padStart(2, '0');
    setSimulatedTime(`${hoursStr}:${minsStr}`);
    setHasManuallyOverridden(true);
  };

  const format24To12 = (time24: string): string => {
    if (!time24 || !time24.includes(':')) return '12:00 AM';
    const [hStr, mStr] = time24.split(':');
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${String(displayHour).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  };

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''} bg-neutral-50 text-neutral-900 flex flex-col font-sans transition-colors duration-300`} id="applet-container">
      
      {/* 1. Header with Time travel indicators */}
      <header className="sticky top-0 z-40 transition-colors duration-300 border-b bg-white border-neutral-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          {/* Logo, Title & Theme Toggle */}
          <div className="flex items-center justify-between md:justify-start gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 bg-indigo-600 rounded-xl text-white shadow-md shadow-indigo-100 flex items-center justify-center">
                <Building className="w-6 h-6" />
              </span>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-neutral-950 flex items-center gap-2">
                  Study Spot
                </h1>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2 rounded-xl border transition-all cursor-pointer flex items-center justify-center ${
                darkMode
                  ? 'bg-neutral-800 border-neutral-700 text-yellow-400 hover:bg-neutral-700'
                  : 'bg-neutral-50 border-neutral-200 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
              }`}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Simulated Time traveler Block (Upper Corner) */}
          <div className="relative bg-neutral-50 border border-neutral-200/80 rounded-2xl p-1.5 md:p-2.5 flex items-center gap-1.5 md:gap-2 w-full md:w-auto justify-center md:justify-start shadow-inner overflow-visible max-w-full flex-nowrap">
            {isMobile ? (
              <AnimatePresence initial={false}>
                {!hasManuallyOverridden && (
                  <motion.div
                    key="time-label"
                    initial={{ opacity: 0, width: 0, marginRight: 0 }}
                    animate={{ opacity: 1, width: 'auto', marginRight: 4 }}
                    exit={{ opacity: 0, width: 0, marginRight: 0 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                    className="flex items-center gap-1 shrink-0 overflow-hidden whitespace-nowrap"
                  >
                    <Clock className="w-4 h-4 text-indigo-600 animate-pulse" />
                    <span className="text-xs font-semibold text-neutral-800">Time:</span>
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <div className="flex items-center gap-1 shrink-0 whitespace-nowrap">
                <Clock className="w-4 h-4 text-indigo-600 animate-pulse" />
                <span className="text-xs font-semibold text-neutral-800">Time:</span>
              </div>
            )}
 
            {/* Custom Day Picker Button and Dropdown */}
            <div className="static md:relative shrink-0">
              <button
                type="button"
                onClick={() => setIsDayPickerOpen(!isDayPickerOpen)}
                className="text-xs px-2 py-1.5 rounded-lg border bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all font-semibold text-neutral-700 border-neutral-300 hover:border-indigo-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer shadow-xs min-w-[90px] sm:min-w-[110px] justify-between"
              >
                <span>{simulatedDay}</span>
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              </button>

              <AnimatePresence>
                {isDayPickerOpen && (
                  <>
                    {/* Close popover by clicking outside */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsDayPickerOpen(false)} 
                    />
                    
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -8 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute left-1/2 -translate-x-1/2 md:left-0 md:translate-x-0 mt-2 w-48 bg-white border border-neutral-200 rounded-2xl shadow-xl p-2 z-50 text-neutral-800"
                    >
                      <div className="flex flex-col gap-1">
                        {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d) => {
                          const isSelected = simulatedDay === d;
                          return (
                            <button
                              key={d}
                              type="button"
                              onClick={() => {
                                setSimulatedDay(d);
                                setHasManuallyOverridden(true);
                                setIsDayPickerOpen(false);
                              }}
                              className={`w-full text-left text-xs font-semibold px-3 py-2 rounded-xl transition-all cursor-pointer flex items-center justify-between ${
                                isSelected
                                  ? 'bg-indigo-600 text-white shadow-xs'
                                  : 'text-neutral-700 hover:bg-indigo-50 hover:text-indigo-600'
                              }`}
                            >
                              <span>{d}</span>
                              {isSelected && <Check className="w-3.5 h-3.5" />}
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
 
            {/* Custom Clock Picker Button and Dropdown */}
            <div className="static md:relative shrink-0">
              <button
                type="button"
                onClick={() => setIsClockPickerOpen(!isClockPickerOpen)}
                className="text-xs px-2 py-1.5 rounded-lg border bg-white focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all font-semibold text-neutral-700 border-neutral-300 hover:border-indigo-500 hover:text-indigo-600 flex items-center gap-1 cursor-pointer shadow-xs min-w-[85px] sm:min-w-[105px] justify-between"
              >
                <span>{format24To12(simulatedTime)}</span>
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
              </button>
 
              <AnimatePresence>
                {isClockPickerOpen && (
                  <>
                    {/* Close popover by clicking outside */}
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsClockPickerOpen(false)} 
                    />
                    
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -8 }}
                      transition={{ duration: 0.15, ease: 'easeOut' }}
                      className="absolute left-1/2 -translate-x-1/2 md:left-auto md:right-0 md:translate-x-0 mt-2 w-64 bg-white border border-neutral-200 rounded-2xl shadow-xl p-4 z-50 text-neutral-800"
                    >
                      {/* Selected Time Display Header */}
                      <div className="flex items-center justify-between border-b border-neutral-100 pb-3 mb-3">
                        <div className="flex items-baseline gap-1">
                          <button
                            type="button"
                            onClick={() => setClockPickerMode('hours')}
                            className={`text-xl font-bold tracking-tight rounded px-1 transition-all ${
                              clockPickerMode === 'hours'
                                ? 'text-indigo-600 bg-indigo-50'
                                : 'text-neutral-500 hover:bg-neutral-50'
                            }`}
                          >
                            {String(currentHour12).padStart(2, '0')}
                          </button>
                          <span className="text-xl font-bold text-neutral-400">:</span>
                          <button
                            type="button"
                            onClick={() => setClockPickerMode('minutes')}
                            className={`text-xl font-bold tracking-tight rounded px-1 transition-all ${
                              clockPickerMode === 'minutes'
                                ? 'text-indigo-600 bg-indigo-50'
                                : 'text-neutral-500 hover:bg-neutral-50'
                            }`}
                          >
                            {String(currentMinute).padStart(2, '0')}
                          </button>
                        </div>
                        
                        {/* AM / PM Toggle buttons */}
                        <div className="flex p-0.5 bg-neutral-100 rounded-lg text-[10px] font-bold">
                          <button
                            type="button"
                            onClick={() => handlePeriodSelect('AM')}
                            className={`px-2 py-1 rounded-md transition-all ${
                              currentPeriod === 'AM'
                                ? 'bg-white text-indigo-600 shadow-xs'
                                : 'text-neutral-500 hover:text-neutral-800'
                            }`}
                          >
                            AM
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePeriodSelect('PM')}
                            className={`px-2 py-1 rounded-md transition-all ${
                              currentPeriod === 'PM'
                                ? 'bg-white text-indigo-600 shadow-xs'
                                : 'text-neutral-500 hover:text-neutral-800'
                            }`}
                          >
                            PM
                          </button>
                        </div>
                      </div>
 
                      {/* Interactive Clock Face */}
                      <div className="relative w-40 h-40 rounded-full bg-neutral-50 border border-neutral-100/80 flex items-center justify-center mx-auto my-1 select-none">
                        {/* Center Dot */}
                        <div className="absolute w-2 h-2 rounded-full bg-indigo-600 z-20" />
 
                        {/* Clock Hand line */}
                        <div 
                          className="absolute bottom-1/2 left-1/2 w-0.5 bg-indigo-600 origin-bottom transition-all duration-200 z-10"
                          style={{ 
                            height: '46px', 
                            transform: `translateX(-50%) rotate(${clockPickerMode === 'hours' ? currentHour12 * 30 : currentMinute * 6}deg)` 
                          }}
                        >
                          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-indigo-600 border border-white shadow-xs" />
                        </div>
 
                        {/* Render hour numbers (1-12) */}
                        {clockPickerMode === 'hours' && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => {
                          const angle = ((h * 30 - 90) * Math.PI) / 180;
                          const x = Math.round(54 * Math.cos(angle));
                          const y = Math.round(54 * Math.sin(angle));
                          const isSelected = currentHour12 === h;
                          return (
                            <button
                              key={h}
                              type="button"
                              onClick={() => handleHourSelect(h)}
                              className={`absolute w-6.5 h-6.5 rounded-full text-[10px] font-bold flex items-center justify-center transition-all cursor-pointer select-none z-20 ${
                                isSelected 
                                  ? 'bg-indigo-600 text-white shadow-xs' 
                                  : 'text-neutral-700 hover:bg-indigo-50 hover:text-indigo-600'
                              }`}
                              style={{
                                  left: `calc(50% + ${x}px)`,
                                  top: `calc(50% + ${y}px)`,
                                  transform: 'translate(-50%, -50%)',
                              }}
                            >
                              {h}
                            </button>
                          );
                        })}
 
                        {/* Render minute numbers (00 to 55) */}
                        {clockPickerMode === 'minutes' && [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 0].map((m, idx) => {
                          const pos = idx + 1;
                          const angle = ((pos * 30 - 90) * Math.PI) / 180;
                          const x = Math.round(54 * Math.cos(angle));
                          const y = Math.round(54 * Math.sin(angle));
                          const isSelected = Math.round(currentMinute / 5) * 5 % 60 === m;
                          return (
                            <button
                              key={m}
                              type="button"
                              onClick={() => handleMinuteSelect(m)}
                              className={`absolute w-6.5 h-6.5 rounded-full text-[9px] font-bold flex items-center justify-center transition-all cursor-pointer select-none z-20 ${
                                isSelected 
                                  ? 'bg-indigo-600 text-white shadow-xs' 
                                  : 'text-neutral-700 hover:bg-indigo-50 hover:text-indigo-600'
                              }`}
                              style={{
                                  left: `calc(50% + ${x}px)`,
                                  top: `calc(50% + ${y}px)`,
                                  transform: 'translate(-50%, -50%)',
                              }}
                            >
                              {String(m).padStart(2, '0')}
                            </button>
                          );
                        })}
                      </div>
 
                      {/* Exact Minute range slider */}
                      <div className="mt-4 px-1 space-y-1">
                        <div className="flex justify-between text-[10px] text-neutral-500 font-semibold">
                          <span>Adjust exact minute:</span>
                          <span className="font-mono text-indigo-600 font-bold">{String(currentMinute).padStart(2, '0')} min</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="59"
                          value={currentMinute}
                          onChange={(e) => handleMinuteSelect(parseInt(e.target.value, 10))}
                          className="w-full h-1 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-hidden"
                        />
                      </div>
 
                      {/* Close / Done Button */}
                      <div className="flex gap-2 mt-4 pt-3 border-t border-neutral-100">
                        <button
                          type="button"
                          onClick={() => setClockPickerMode(clockPickerMode === 'hours' ? 'minutes' : 'hours')}
                          className="flex-1 py-1 px-2 border border-neutral-200 rounded-lg text-[10px] font-semibold text-neutral-600 hover:bg-neutral-50 active:bg-neutral-100 transition-all cursor-pointer"
                        >
                          Set {clockPickerMode === 'hours' ? 'Minutes' : 'Hours'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsClockPickerOpen(false)}
                          className="py-1 px-3 bg-indigo-600 text-white rounded-lg text-[10px] font-bold hover:bg-indigo-700 active:bg-indigo-800 transition-all cursor-pointer"
                        >
                          Done
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
 
            {isMobile ? (
              <AnimatePresence>
                {hasManuallyOverridden && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, width: 0, scale: 0.8 }}
                    animate={{ opacity: 1, width: 'auto', scale: 1 }}
                    exit={{ opacity: 0, width: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 26 }}
                    onClick={() => {
                      setHasManuallyOverridden(false);
                      setIsClockPickerOpen(false);
                      setIsDayPickerOpen(false);
                    }}
                    title="Restore live computer system time alignment"
                    className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg transition-all font-bold shadow-xs cursor-pointer whitespace-nowrap overflow-hidden shrink-0"
                  >
                    Reset
                  </motion.button>
                )}
              </AnimatePresence>
            ) : (
              hasManuallyOverridden && (
                <button
                  type="button"
                  onClick={() => {
                    setHasManuallyOverridden(false);
                    setIsClockPickerOpen(false);
                    setIsDayPickerOpen(false);
                  }}
                  title="Restore live computer system time alignment"
                  className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg transition-all font-bold shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  Reset
                </button>
              )
            )}
          </div>

        </div>
      </header>

      {/* 2. Main Workspace Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        
        {/* --- LEFT COLUMN: CONTROL ROOM (SEARCH, TYPE, DURATION FILTERS) --- */}
        <div className="lg:col-span-1 space-y-5 bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs lg:sticky lg:top-24">
          
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">Search Workspace</span>
          </div>

          {/* Search Term UI Input */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
              <input
                type="text"
                placeholder="Search rooms, specs, slots..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-600 transition-all placeholder:text-neutral-400 font-medium"
              />
            </div>
          </div>

          <hr className="border-neutral-100" />

          {/* Minimum Available Duration Filter Block */}
          <div className="space-y-2 select-none">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-neutral-700">Min Vacancy Duration:</span>
              <span className="text-indigo-600 font-bold font-mono bg-indigo-50 px-2 py-0.5 rounded-md">
                {minDurationFilter === 0 ? 'No Limit' : `≥ ${formatDurationText(minDurationFilter)}`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="240"
              step="30"
              value={minDurationFilter}
              onChange={(e) => setMinDurationFilter(parseInt(e.target.value))}
              className="w-full h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-hidden"
            />
            <div className="flex justify-between text-[10px] text-neutral-400 font-mono">
              <span>Show All</span>
              <span>1 hr</span>
              <span>2 hrs</span>
              <span>3 hrs</span>
              <span>4+ hrs</span>
            </div>
          </div>

          {/* Custom Spreadsheet schedule loader trigger */}
          <div className="pt-2 gap-2 flex flex-col">
            <button
              onClick={handleSyncBRACUniversityLive}
              disabled={isSyncing}
              className={`w-full text-xs font-bold text-white bg-indigo-600 border border-indigo-700 rounded-xl px-4 py-2.5 hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100 ${
                isSyncing ? 'opacity-80 cursor-not-allowed bg-indigo-500' : ''
              }`}
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{syncStatus || 'Syncing...'}</span>
                </>
              ) : (
                <>
                  <span>Sync BRAC University</span>
                </>
              )}
            </button>

            <button
              onClick={() => setIsImportOpen(true)}
              className="w-full text-xs font-semibold text-indigo-600 bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-2.5 hover:bg-indigo-100 hover:text-indigo-800 transition-all flex items-center justify-center gap-1.5 shadow-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              Feed Google Sheets CSV / TSV
            </button>
             <button
              onClick={() => {
                setImportantDatesTab('dates');
                setIsImportantDatesOpen(true);
              }}
              className="w-full text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 hover:bg-emerald-100 hover:text-emerald-950 transition-all flex items-center justify-center gap-1.5 shadow-sm shadow-emerald-50"
            >
              <Calendar className="w-3.5 h-3.5 text-emerald-600" />
              <span>Important Dates & Holidays</span>
            </button>
          </div>

        </div>

        {/* --- RIGHT COLUMN: ACTIVE RESULTS WORKSPACE --- */}
        <div className="lg:col-span-3 space-y-6">

          {/* Tab Selector & Overview Info */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-3" id="tab-nav-panel">
            <div className="flex p-1 bg-neutral-200/60 rounded-xl self-start w-full sm:w-auto">
              <button
                onClick={() => setRoomTypeTab('lab')}
                className={`flex-1 sm:flex-initial px-8 py-2 md:px-12 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  roomTypeTab === 'lab' 
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-100' 
                    : 'text-neutral-500 hover:text-blue-600'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${roomTypeTab === 'lab' ? 'bg-white' : 'bg-blue-400'}`}></span>
                Labs ({rooms.filter(r => r.type === 'lab').length})
              </button>

              <button
                onClick={() => setRoomTypeTab('class')}
                className={`flex-1 sm:flex-initial px-8 py-2 md:px-12 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                  roomTypeTab === 'class' 
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-100' 
                    : 'text-neutral-500 hover:text-emerald-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${roomTypeTab === 'class' ? 'bg-white' : 'bg-emerald-400'}`}></span>
                Class ({rooms.filter(r => r.type === 'class').length})
              </button>
            </div>

            {/* Simulated Live indicator */}
            <div className="text-right flex items-center gap-2 self-end sm:self-auto">
              <span className="text-xs text-neutral-400">
                Found <strong className="text-neutral-800">{processedRoomsList.length}</strong> matching layout spaces
              </span>
              <span className="text-neutral-300">|</span>
              <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 border border-indigo-100 text-indigo-800 px-2.5 py-1 rounded-full font-medium">
                📅 {simulatedDay} @ {simulatedTime}
              </span>
            </div>
          </div>

          {/* Night closure and Holiday detection banners */}
          {isNightTimeClosed ? (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-xs my-2"
            >
              <div className="w-11 h-11 bg-blue-100 dark:bg-blue-900/60 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-lg mb-2">🌙</div>
              <h3 className="text-base font-extrabold text-blue-950 dark:text-white">The university is closed at this moment</h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 max-w-md mx-auto leading-relaxed">
                The university is closed at this moment. Change time to see another time's schedule.
              </p>
              <button
                type="button"
                onClick={() => {
                  setClockPickerMode('hours');
                  setIsClockPickerOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:bg-blue-700 dark:hover:bg-blue-600 transition-all rounded-xl shadow-md dark:shadow-none cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Change Time</span>
              </button>
            </motion.div>
          ) : isHolidaySearchedOrActive ? (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-xs my-2"
            >
              <div className="w-11 h-11 bg-blue-100 dark:bg-blue-900/60 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 text-lg mb-2">🎉</div>
              <h3 className="text-base font-extrabold text-blue-950 dark:text-white">Today is Holiday :D</h3>
              <p className="text-xs text-neutral-600 dark:text-neutral-300 mt-1 max-w-md mx-auto leading-relaxed">
                Regular classroom classes and laboratory schedule slots are suspended for the holiday. Double check the official academic schedule.
              </p>
              <button
                type="button"
                onClick={() => {
                  setImportantDatesTab('holidays');
                  setIsImportantDatesOpen(true);
                }}
                className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 dark:shadow-none transition-all rounded-xl shadow-md shadow-blue-100 cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>See all Holidays</span>
              </button>
            </motion.div>
          ) : null}

          {/* Empty search fallback */}
          {(isHolidaySearchedOrActive || isNightTimeClosed) ? null : processedRoomsList.length === 0 ? (
            <div className="py-16 text-center bg-white border border-dashed border-neutral-200 rounded-3xl p-8 flex flex-col items-center justify-center">
              <div className="p-3 bg-neutral-100 rounded-full text-neutral-400 mb-3">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h3 className="text-base font-semibold text-neutral-800">No rooms match your filters</h3>
              <p className="text-xs text-neutral-500 mt-1 max-w-sm mx-auto leading-relaxed">
                Try dragging down the minimum available duration limit, clearing your query, or searching for other days of the week.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setMinDurationFilter(0);
                  setOnlyAvailableNow(true);
                }}
                className="mt-4 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-xs"
              >
                Clear All Search Filters
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5" id="rooms-bento-grid">
              <AnimatePresence mode="popLayout">
                {processedRoomsList.map((item) => {
                  const isLab = item.room.type === 'lab';
                  
                  // Active class checks
                  const isUserCheckedIn = !!userCheckIns[item.room.id];

                  // Setup borders and text accent colors based on Lab (Blue) vs Class (Green) styles as requested
                  const cardBgClass = isLab ? 'bg-blue-50/40 border-blue-100 shadow-blue-50/30' : 'bg-emerald-50/40 border-emerald-100 shadow-emerald-50/30';
                  const primaryBorderClass = isLab ? 'border-blue-200 focus:ring-blue-500/10' : 'border-emerald-200 focus:ring-emerald-500/10';
                  const badgeStyle = isLab ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  const highlightHeader = isLab ? 'text-blue-900' : 'text-emerald-950';
                  
                  // Occupancy warning colors
                  let occupancyStatusText = 'Quiet Study Space';
                  let occupancyColorClass = 'bg-emerald-500';
                  if (item.occupancyPercentage >= 80) {
                    occupancyStatusText = 'Heavy occupancy';
                    occupancyColorClass = 'bg-rose-500';
                  } else if (item.occupancyPercentage >= 40) {
                    occupancyStatusText = 'Moderate occupancy';
                    occupancyColorClass = 'bg-amber-500';
                  }

                  return (
                    <motion.div
                      key={item.room.id}
                      layoutId={`room-card-${item.room.id}`}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.25 }}
                      className={`relative bg-white border ${isUserCheckedIn ? primaryBorderClass : 'border-neutral-200'} rounded-2xl p-5 flex flex-col justify-between hover:shadow-lg hover:border-neutral-300 transition-all shadow-xs overflow-hidden`}
                    >
                      {/* Sub-Header style depending on class type */}
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${badgeStyle}`}>
                              {item.room.type}
                            </span>
                            <span className="text-[11px] text-neutral-400 font-medium flex items-center gap-0.5">
                              <MapPin className="w-3 h-3" /> {item.room.location.split(',')[0]}
                            </span>
                          </div>
                          <h3 className={`text-base font-bold ${highlightHeader} mt-1 leading-tight`}>
                            {item.room.name}
                          </h3>
                        </div>

                        {/* VACANT / BUSY pulsing tag */}
                        {item.isFreeNow ? (
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full ${isLab ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'} border ${primaryBorderClass}`}>
                            Vacant
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-neutral-100 text-neutral-700 border border-neutral-200 px-2.5 py-1 rounded-full">
                            Occupied until {item.nextAvailableTime}
                          </span>
                        )}
                      </div>

                      {/* Equipment Spec feature tags */}
                      <div className="flex flex-wrap gap-1 mb-4">
                        {item.room.features.slice(0, 3).map((f, idx) => {
                          let labelSuffix = '';
                          if (f.toLowerCase() === 'lab computers' && item.pcStatus) {
                            labelSuffix = ` [${item.pcStatus}]`;
                          }
                          return (
                            <span key={idx} className="text-[9.5px] font-medium bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-md">
                              {f}{labelSuffix}
                            </span>
                          );
                        })}
                        {/* If it's a classroom, let's also render Classroom Size bracket */}
                        {!isLab && item.sizeStatus && (
                          <span className="text-[9.5px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-md">
                            Classroom Size: {item.sizeStatus}
                          </span>
                        )}
                      </div>

                      {/* Dynamic Booking Details Frame */}
                      <div className={`p-3 rounded-xl border mb-4 text-xs ${cardBgClass} border-neutral-100`}>
                        {item.isFreeNow ? (
                          <div className="space-y-1.5 text-left">
                            {item.freeUntil ? (
                              <p className="font-semibold text-neutral-800 leading-normal">
                                Free for <strong className="text-indigo-600 font-extrabold">{formatDurationText(item.freeDurationMinutes)}</strong> (until {item.freeUntil})
                              </p>
                            ) : (
                              <p className="font-semibold text-neutral-800">Free all day</p>
                            )}

                            {item.nextBooking ? (
                              <div className="pt-1.5 border-t border-dashed border-neutral-200 mt-1.5 text-[10.5px] flex items-center justify-between text-neutral-500">
                                <span>{item.room.type === 'lab' ? 'Next Lab' : 'Next Class'} @ {item.nextBooking.startTime}:</span>
                                <span className="font-semibold text-neutral-600 truncate max-w-[130px]" title={item.nextBooking.subject}>
                                  {item.nextBooking.subject}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-neutral-400 block pt-1 border-t border-dashed border-neutral-200">No scheduled classes remaining today</span>
                            )}
                          </div>
                        ) : (
                          // Busy Now
                          <div className="space-y-1 text-left">
                            <div className="flex justify-between text-[10.5px] text-neutral-500">
                              <span>Status right now:</span>
                              <span className="font-bold text-rose-700 font-mono">Booked</span>
                            </div>
                            <p className="font-bold text-neutral-800 leading-tight truncate" title={item.currentBooking?.subject}>
                              {item.currentBooking?.subject}
                            </p>
                            <p className="text-[11px] text-neutral-500">
                              Lecturer: {item.currentBooking?.instructor || 'Staff'}
                            </p>
                            
                            {item.nextAvailableTime && (
                              <div className="pt-1.5 border-t border-dashed border-neutral-200 mt-1.5 text-[10.5px] text-neutral-600">
                                Next free at <strong className="text-indigo-600 font-semibold">{item.nextAvailableTime}</strong>
                              </div>
                            )}


                          </div>
                        )}
                      </div>

                      {/* Predicted Occupancy Progress Meter bar */}
                      <div className="space-y-1.5 mb-5 select-none" id="occupancy-progress-bar">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-neutral-500 font-medium">Estimated Crowd:</span>
                          <span className="font-bold text-neutral-800 font-mono">
                            {item.occupancyPercentage}% ({occupancyStatusText})
                          </span>
                        </div>
                        {/* Progress Bar background layout */}
                        <div className="w-full h-2 bg-neutral-100 rounded-full overflow-hidden">
                          <motion.div 
                             initial={{ width: 0 }}
                             animate={{ width: `${item.occupancyPercentage}%` }}
                             transition={{ duration: 0.3 }}
                             className={`h-full rounded-full ${occupancyColorClass}`}
                          />
                        </div>
                      </div>

                      {/* CROWDSOURCE PARTICIPATION ("Are you going in this space?") */}
                      <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                        <button
                          type="button"
                          onClick={() => handleCheckInToggle(item.room.id)}
                          className={`w-full py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 text-xs transition-all ${
                            isUserCheckedIn
                              ? 'bg-neutral-800 text-white shadow-md'
                              : isLab 
                                ? 'bg-blue-650 hover:bg-blue-700 text-blue-1050 bg-blue-50 border border-blue-200 hover:border-blue-400'
                                : 'bg-emerald-650 hover:bg-emerald-700 text-emerald-1050 bg-emerald-50 border border-emerald-200 hover:border-emerald-400'
                          }`}
                        >
                          {isUserCheckedIn ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span>Checked In! Leave Space</span>
                            </>
                          ) : (
                            <>
                              <Users className="w-4 h-4 shrink-0 text-neutral-500" />
                              <span>I am heading There</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setSelectedRoomSchedule(selectedRoomSchedule === item.room.id ? null : item.room.id)}
                          title="View entire booking agenda"
                          className="p-2 border border-neutral-200 rounded-xl hover:bg-neutral-50 hover:border-neutral-300 transition-colors shrink-0 text-neutral-600"
                          aria-label="View room schedule"
                        >
                          <BookOpen className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Expandable Crowdsourced Voting extension for checked-in space */}
                      <AnimatePresence>
                        {isUserCheckedIn && !feedbackHidden[item.room.id] && (
                          <motion.div
                            key="feedback-form"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.3 }}
                            className="mt-3.5 bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 space-y-4 text-left text-xs overflow-hidden"
                          >
                            <div className="border-b border-neutral-200 pb-1.5 flex justify-between items-center">
                              <span className="font-bold text-neutral-800 flex items-center gap-1">
                                <span>🗳️ Submit live feedback</span>
                              </span>
                              <span className="text-[10px] text-neutral-400 font-medium">Auto-updated instantly</span>
                            </div>

                            {/* 1. Vote on Space Density (3 choices) */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between items-center">
                                <p className="font-semibold text-neutral-700">How crowded is the room right now?</p>
                                <span className="text-[10px] text-neutral-400 bg-neutral-100/60 px-1.5 py-0.5 rounded-sm font-medium">
                                  Decays after 1h
                                </span>
                              </div>
                              <div className="grid grid-cols-3 gap-1.5">
                                {[
                                  { key: 'low', label: 'Low', color: 'hover:bg-emerald-50 hover:text-emerald-700 border-emerald-100' },
                                  { key: 'medium', label: 'Medium', color: 'hover:bg-amber-50 hover:text-amber-700 border-amber-100' },
                                  { key: 'high', label: 'High', color: 'hover:bg-rose-50 hover:text-rose-700 border-rose-100' }
                                ].map((opt) => {
                                  const currentVote = userVotes[item.room.id]?.crowd;
                                  const isSelected = currentVote === opt.key;
                                  return (
                                    <button
                                      key={opt.key}
                                      type="button"
                                      onClick={() => handleVote(item.room.id, 'crowd', opt.key)}
                                      className={`py-1.5 px-2 text-center rounded-lg font-bold border transition-all cursor-pointer ${
                                        isSelected 
                                          ? 'bg-neutral-800 text-white border-neutral-800 shadow-xs' 
                                          : `bg-white border-neutral-200 text-neutral-600 ${opt.color}`
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* 2. Vote on Specific Feature (Lab PC Good vs. Class Size Spacious) */}
                            {isLab ? (
                              <div className="space-y-1.5">
                                <p className="font-semibold text-neutral-700">How good are the Lab Computers?</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {[
                                    { key: 'good', label: 'Very Good', color: 'hover:bg-blue-50 hover:text-blue-700' },
                                    { key: 'medium', label: 'Medium', color: 'hover:bg-blue-50 hover:text-blue-700' },
                                    { key: 'poor', label: 'Not Good', color: 'hover:bg-blue-50 hover:text-blue-700' }
                                  ].map((opt) => {
                                    const currentVote = userVotes[item.room.id]?.spec;
                                    const isSelected = currentVote === opt.key;
                                    return (
                                      <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => handleVote(item.room.id, 'spec', opt.key)}
                                        className={`py-1.5 px-2 text-center rounded-lg font-bold border transition-all cursor-pointer ${
                                          isSelected 
                                            ? 'bg-neutral-800 text-white border-neutral-800 shadow-xs' 
                                            : `bg-white border-neutral-200 text-neutral-600 ${opt.color}`
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5">
                                <p className="font-semibold text-neutral-700">Is the classroom layout spacious?</p>
                                <div className="grid grid-cols-3 gap-1.5">
                                  {[
                                    { key: 'spacious', label: 'Spacious', color: 'hover:bg-emerald-50 hover:text-emerald-700' },
                                    { key: 'standard', label: 'Standard', color: 'hover:bg-emerald-50 hover:text-emerald-700' },
                                    { key: 'cramped', label: 'Cramped', color: 'hover:bg-emerald-50 hover:text-emerald-700' }
                                  ].map((opt) => {
                                    const currentVote = userVotes[item.room.id]?.spec;
                                    const isSelected = currentVote === opt.key;
                                    return (
                                      <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => handleVote(item.room.id, 'spec', opt.key)}
                                        className={`py-1.5 px-2 text-center rounded-lg font-bold border transition-all cursor-pointer ${
                                          isSelected 
                                            ? 'bg-neutral-800 text-white border-neutral-800 shadow-xs' 
                                            : `bg-white border-neutral-200 text-neutral-600 ${opt.color}`
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}


                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* Expandable Schedule Agenda List */}
                      {selectedRoomSchedule === item.room.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          className="bg-neutral-50 border border-neutral-200 rounded-xl p-3.5 mt-3 space-y-2 text-left"
                        >
                          <div className="flex justify-between items-center pb-1 border-b border-neutral-200">
                            <span className="font-bold text-xs text-neutral-800">Weekly Schedule Agenda:</span>
                            <span className="text-[10px] text-neutral-400">Total {bookings.filter(b => b.roomId === item.room.id).length} classes</span>
                          </div>
                          
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {bookings.filter(b => b.roomId === item.room.id).length === 0 ? (
                              <p className="text-neutral-400 italic text-center py-2 text-[11px]">No weekly schedules found.</p>
                            ) : (
                              [...bookings.filter(b => b.roomId === item.room.id)]
                                .sort((a,b) => {
                                  const dayMap: Record<string, number> = { 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6, 'Sunday': 7 };
                                  if(a.day !== b.day) return dayMap[a.day] - dayMap[b.day];
                                  return timeToMinutes(a.startTime) - timeToMinutes(b.startTime);
                                })
                                .map((b, idx) => (
                                  <div key={idx} className="flex justify-between text-xs py-1 border-b border-neutral-200/50 last:border-0 leading-normal">
                                    <div>
                                      <span className="font-semibold text-neutral-700 bg-neutral-200/70 px-1.5 py-0.5 rounded text-[10px] mr-1.5 inline-block">
                                        {b.day.substring(0,3)}
                                      </span>
                                      <span className="text-neutral-900 font-medium">{b.subject}</span>
                                    </div>
                                    <div className="text-neutral-500 font-semibold shrink-0 text-right text-[10.5px]">
                                      {b.startTime} - {b.endTime}
                                    </div>
                                  </div>
                                ))
                            )}
                          </div>
                        </motion.div>
                      )}

                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Notice at the bottom of the list */}
            <div className="text-center py-3 text-xs font-semibold text-neutral-500 bg-neutral-100/50 border border-neutral-200/50 rounded-xl max-w-max mx-auto px-6 mt-4 shadow-2xs select-none">
              {roomTypeTab === 'lab' ? 'Labs from other Departments Maybe Available' : 'Classes from other Departments Maybe Available'}
            </div>
          </>
        )}

        </div>
      </main>

      {/* --- FLOATING SHEETS IMPORT MODAL --- */}
      {isImportOpen && (
        <CsvImporter
          rooms={rooms}
          onImport={handleImportSchedule}
          onClose={() => setIsImportOpen(false)}
          onShowToast={showToast}
        />
      )}

      {/* --- IMPORTANT DATES & HOLIDAYS MODAL --- */}
      {isImportantDatesOpen && (
        <ImportantDatesModal
          onClose={() => setIsImportantDatesOpen(false)}
          simulatedMonth={simulatedMonth}
          initialTab={importantDatesTab}
          onShowToast={showToast}
        />
      )}

      {/* 4. Elegant Minimal Footer */}
      <footer id="applet-footer" className="bg-[#4f39f6] border-t border-white/10 mt-12 py-4 select-none transition-colors duration-300 shadow-inner">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-row justify-between items-center gap-4">
          <p className="text-[10px] sm:text-sm font-medium text-indigo-100 shrink-0">© 2026 Study Spot.</p>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <span className="font-bold text-[10px] sm:text-sm text-white">A Product of Farhan</span>
            <div className="flex items-center gap-1.5 sm:gap-3 text-[9px] sm:text-xs text-indigo-100/90">
              <a 
                href="https://www.linkedin.com/in/md-farhan-cse" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-white transition-all hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.95)] cursor-pointer font-medium underline decoration-indigo-300/50 hover:decoration-white"
              >
                LinkedIn
              </a>
              <span className="text-indigo-300/40">|</span>
              <a 
                href="https://github.com/FarhanKO" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="hover:text-white transition-all hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.95)] cursor-pointer font-medium underline decoration-indigo-300/50 hover:decoration-white"
              >
                GitHub
              </a>
              <span className="text-indigo-300/40">|</span>
              <a 
                href="mailto:farhanzian22@gmail.com" 
                className="hover:text-white transition-all hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.95)] cursor-pointer font-medium underline decoration-indigo-300/50 hover:decoration-white"
              >
                Mail
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* --- Toast Overlays --- */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm pointer-events-none">
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className={`pointer-events-auto flex items-center gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all max-w-md ${
                toast.type === 'success'
                  ? 'bg-emerald-50/95 border-emerald-100 text-emerald-800'
                  : toast.type === 'error'
                  ? 'bg-rose-50/95 border-rose-100 text-rose-800'
                  : 'bg-indigo-50/95 border-indigo-100 text-indigo-800'
              }`}
            >
              {toast.type === 'success' && <Check className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />}
              {toast.type === 'info' && <Info className="w-5 h-5 shrink-0 text-indigo-600 dark:text-indigo-400" />}
              <p className="text-xs font-semibold leading-relaxed">{toast.message}</p>
              <button
                onClick={() => setToast(null)}
                className="ml-auto p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-current/60 hover:text-current"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* --- Custom Confirm Overlay --- */}
      <AnimatePresence>
        {confirmConfig && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-neutral-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-neutral-200 rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                  <Info className="w-5 h-5" />
                </span>
                <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Confirm Action</h3>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
                {confirmConfig.message}
              </p>
              <div className="flex gap-2 justify-end mt-2">
                <button
                  onClick={() => setConfirmConfig(null)}
                  className="px-4 py-2 border border-neutral-200 hover:bg-neutral-50 rounded-xl text-xs font-semibold text-neutral-600 transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    confirmConfig.onConfirm();
                    setConfirmConfig(null);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer"
                >
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
