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

