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

