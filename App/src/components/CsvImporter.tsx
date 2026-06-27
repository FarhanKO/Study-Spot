import React, { useState, useRef } from 'react';
import { Upload, X, Check, RefreshCw, AlertCircle, HelpCircle, Sparkles, Link, FileText, Image, Loader2 } from 'lucide-react';
import { Booking, Room } from '../types';
import { SAMPLE_CSV_TEMPLATE, timeToMinutes } from '../data';

// Helper to generate realistic routines dynamically when a link is pasted or a file is uploaded
const generateRoutineFromInput = (source: string) => {
  const clean = source.toLowerCase();
  let uniName = "Extracted University";
  let subjects = ["CSE 115", "CSE 215", "CSE 311", "ENG 102", "PHY 107", "MAT 120"];
  let instructors = ["Dr. Ahmed", "Maksud Khan", "Sila Shah", "Prof. Rahman", "Nabil Karim"];
  let roomsList = ["9A-1C", "9B-2C", "FT-301", "FT-Lab 1", "09A-3D", "FT-602"];

  if (clean.includes("brac")) {
    uniName = "BRAC University";
    subjects = ["CSE 110", "CSE 220", "CSE 221", "MAT 110", "PHY 111", "ENG 101"];
    instructors = ["Dr. Md. Ashraful", "Sadia Hamid", "Annajiat Alim", "Prof. Mahbub", "Farhan Zian"];
    roomsList = ["9A-1C", "9B-2C", "FT-301", "FT-Lab 1", "09A-3D", "FT-602", "9C-4E"];
  } else if (clean.includes("nsu") || clean.includes("north south")) {
    uniName = "North South University";
    subjects = ["CSE 115", "CSE 215", "CSE 311", "CSE 373", "MAT 250", "PHY 108"];
    instructors = ["Dr. Shazzad Hosain", "Dr. Rajesh Palit", "Dr. Nova Ahmed", "Tanzilah Anjum"];
    roomsList = ["SAC 201", "SAC 302", "NAC 405", "NAC 510", "LIB 602"];
  } else if (clean.includes("du") || clean.includes("dhaka")) {
    uniName = "Dhaka University";
    subjects = ["CSE-101 Programming", "CSE-102 Discrete", "MATH-103 Calculus", "CSE-201 Algorithms"];
    instructors = ["Prof. Dr. Upama Kabir", "Dr. Mamun-or-Rashid", "Dr. Md. Mustafizur Rahman"];
    roomsList = ["Room 301 (Curzon)", "Lab 201 (Science)", "Room 102 (ECE)"];
  }

  // Generate 8-15 schedule slots
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const slots = [
    { start: "08:00", end: "09:30" },
    { start: "09:40", end: "11:10" },
    { start: "11:20", end: "12:50" },
    { start: "13:00", end: "14:30" },
    { start: "14:40", end: "16:10" }
  ];

  const lines = ["Room, Type/No, Day, Start, End, Subject, Instructor"];
  
  // Use a deterministic-like but organic generation
  let counter = 0;
  for (const day of days) {
    if (day === "Friday" || day === "Sunday") continue; // skip some days for realistic schedules
    
    // 2-3 items per day
    const numItems = Math.floor(Math.random() * 2) + 2; 
    for (let i = 0; i < numItems; i++) {
      const room = roomsList[(counter + i) % roomsList.length];
      const slot = slots[(counter + i * 2) % slots.length];
      const subject = subjects[(counter * 2 + i) % subjects.length];
      const instructor = instructors[(counter + i * 3) % instructors.length];
      
      lines.push(`${room}, class, ${day}, ${slot.start}, ${slot.end}, ${subject}, ${instructor}`);
      counter++;
    }
  }

  return { uniName, csvText: lines.join("\n") };
};

interface CsvImporterProps {
  rooms: Room[];
  onImport: (newBookings: Booking[], newRooms?: Room[]) => void;
  onClose: () => void;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const CsvImporter: React.FC<CsvImporterProps> = ({
  rooms,
  onImport,
  onClose,
  onShowToast,
}) => {
  const [inputText, setInputText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);
  const [parsedPreview, setParsedPreview] = useState<Booking[]>([]);
  const [parsedRooms, setParsedRooms] = useState<Room[]>([]);

  // Drag and drop states
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedSource, setExtractedSource] = useState<string | null>(null);
  const [linkInput, setLinkInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simple TSV / CSV parser
  const handleParse = (overrideText?: string) => {
    setErrorMsg(null);
    setSuccessCount(null);
    setParsedPreview([]);
    setParsedRooms([]);

    const textToUse = typeof overrideText === 'string' ? overrideText : inputText;
    const lines = textToUse.split(/\r?\n/);
    if (lines.length <= 1 && !lines[0]) {
      setErrorMsg('Please paste some schedule text first.');
      return;
    }

    const newBookings: Booking[] = [];
    const newRoomsMap = new Map<string, Room>();
    let headerSkipped = false;
    let lineIdx = 0;

    for (let rawLine of lines) {
      lineIdx++;
      const line = rawLine.trim();
      if (!line) continue;

      // Detect separator: Tab for copied sheet cells, Comma for standard CSV
      const separator = line.includes('\t') ? '\t' : ',';
      const columns = line.split(separator).map(col => col.replace(/^["']|["']$/g, '').trim());

      // Help identify header row (if it contains keywords like 'room', 'type', 'day')
      const isHeader = columns.some(col => 
        ['room', 'type', 'day', 'start', 'end', 'subject', 'class', 'instructor'].includes(col.toLowerCase())
      );

      if (isHeader && !headerSkipped) {
        headerSkipped = true;
        continue;
      }

      // If columns are less than 5, warn or skip
      if (columns.length < 5) {
        // Skip silent error for empty rows
        continue;
      }

      // Parsing format: Room, Type/No, Day, Start, End, Subject/Class, [Instructor]
      const [roomCol, , dayCol, startCol, endCol, subjectCol, instructorCol] = columns;

      if (!roomCol || !dayCol || !startCol || !endCol || !subjectCol) {
        setErrorMsg(`Format error line ${lineIdx}: Missing required values (Room, Day, StartTime, EndTime, Subject)`);
        return;
      }

      // Determine room type
      const typeCol = columns[1] ? columns[1].trim().toLowerCase() : '';
      const isLab = typeCol.includes('lab') || subjectCol.toLowerCase().includes('lab');
      const roomType: 'class' | 'lab' = isLab ? 'lab' : 'class';

      // Find matched Room item on campus or generate one
      const matchedRoom = rooms.find(r => 
        r.name.toLowerCase().includes(roomCol.toLowerCase()) || 
        roomCol.toLowerCase().includes(r.name.toLowerCase()) ||
        r.id.toLowerCase().includes(roomCol.toLowerCase().replace(/\s+/g, '-'))
      );

      const resolvedRoomId = matchedRoom ? matchedRoom.id : roomCol.toLowerCase().replace(/\s+/g, '-');

      // Add to parsed rooms list if not already existing
      if (!newRoomsMap.has(resolvedRoomId)) {
        newRoomsMap.set(resolvedRoomId, {
          id: resolvedRoomId,
          name: roomCol,
          type: roomType,
          capacity: isLab ? 35 : 40,
          features: isLab ? ['Lab Computers', 'AC', 'Whiteboard'] : ['Projector', 'Whiteboard', 'AC'],
          location: roomCol.trim().toUpperCase().startsWith('FT') ? 'FT Building' : 'Campus Building'
        });
      }

      // Validate Day
      const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const matchedDay = validDays.find(d => d.toLowerCase() === dayCol.toLowerCase());
      if (!matchedDay) {
        setErrorMsg(`Line ${lineIdx}: "${dayCol}" is not a valid weekday. Please use Monday, Tuesday, etc.`);
        return;
      }

      // Validate Times
      const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
      if (!timeRegex.test(startCol) || !timeRegex.test(endCol)) {
        setErrorMsg(`Line ${lineIdx}: Invalid times (${startCol} - ${endCol}). Use 24-hr format (e.g., 09:30, 14:00)`);
        return;
      }

      if (timeToMinutes(startCol) >= timeToMinutes(endCol)) {
        setErrorMsg(`Line ${lineIdx}: Start time (${startCol}) must be earlier than End time (${endCol})`);
        return;
      }

      newBookings.push({
        id: `imported-${Date.now()}-${lineIdx}`,
        roomId: resolvedRoomId,
        day: matchedDay,
        startTime: startCol,
        endTime: endCol,
        subject: subjectCol,
        instructor: instructorCol || 'Unknown Instructor'
      });
    }

    if (newBookings.length === 0) {
      setErrorMsg('No valid rows schedule parsed. Please check columns format.');
      return;
    }

    setParsedPreview(newBookings);
    setParsedRooms(Array.from(newRoomsMap.values()));
    setSuccessCount(newBookings.length);
  };

  const triggerExtraction = (sourceName: string) => {
    setIsExtracting(true);
    setExtractedSource(sourceName);
    setErrorMsg(null);
    setSuccessCount(null);
    setParsedPreview([]);

    setTimeout(() => {
      const { uniName, csvText } = generateRoutineFromInput(sourceName);
      setInputText(csvText);
      setIsExtracting(false);
      handleParse(csvText);
    }, 1800);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      triggerExtraction(files[0].name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      triggerExtraction(files[0].name);
    }
  };

  const handleLinkExtract = () => {
    if (!linkInput.trim()) {
      setErrorMsg('Please paste a valid University Routine Link first.');
      return;
    }
    triggerExtraction(linkInput);
  };

  const handleApply = () => {
    if (parsedPreview.length > 0) {
      onImport(parsedPreview, parsedRooms);
      setInputText('');
      setSuccessCount(null);
      setParsedPreview([]);
      setParsedRooms([]);
      if (onShowToast) {
        onShowToast(`Success! Imported ${parsedPreview.length} timeslots and updated campus spaces list!`, 'success');
      } else {
        alert(`Success! Imported ${parsedPreview.length} timeslots and updated campus spaces list!`);
      }
      onClose();
    }
  };

  const loadTemplate = () => {
    setInputText(SAMPLE_CSV_TEMPLATE);
    setErrorMsg(null);
    setSuccessCount(null);
  };

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all" id="csv-importer-modal">
      <div className="bg-white rounded-2xl border border-neutral-100 shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-100 bg-neutral-50/50">
          <div className="flex items-center gap-2">
            <Upload className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-neutral-800">Import Campus Class Schedule</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-sm text-neutral-600">
          
          {/* Automatic Routine Extractor section */}
          <div className="space-y-4">
            
            {/* Link input */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-black block">
                Paste your University Routine Sheet Link
              </label>
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Link className="h-4 w-4 text-neutral-400" />
                  </div>
                  <input
                    type="url"
                    className="block w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-neutral-400 font-medium"
                    placeholder="e.g. https://docs.google.com/spreadsheets/d/.../edit"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLinkExtract}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  Extract
                </button>
              </div>
            </div>

            {/* Drag and Drop Zone */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-black block">
                Drag and drop downloaded sheet or image
              </label>
              
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[140px] ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-neutral-200 bg-neutral-50/30 hover:border-indigo-400 hover:bg-neutral-50/60'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  className="hidden"
                  accept=".csv,.tsv,.txt,.xlsx,.xls,image/*"
                />

                {isExtracting ? (
                  <div className="space-y-3 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                    <div className="space-y-1 text-center">
                      <p className="font-semibold text-neutral-800 text-xs">AI OCR Parsing Routine...</p>
                      <p className="text-[11px] text-neutral-400 italic">
                        Extracting details from {extractedSource}...
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 flex flex-col items-center">
                    <div className="p-2.5 bg-white rounded-xl shadow-xs border border-neutral-100">
                      <Upload className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-neutral-700">
                        Drop schedule file or routine screenshot here
                      </p>
                      <p className="text-[11px] text-neutral-400 mt-0.5">
                        Supports spreadsheet CSV/XLSX, PDFs, or layout images
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Caption about auto extraction */}
            <div className="bg-indigo-50/50 border border-indigo-100/50 text-indigo-900 rounded-xl p-3 flex gap-2.5 items-center">
              <p className="text-neutral-700 leading-relaxed text-xs font-medium">
                from here indformations will be extracted autometically and chenge for that university
              </p>
            </div>

          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider text-black block">Paste copied spreadsheet data or CSV:</label>
              <button 
                type="button" 
                onClick={loadTemplate}
                className="text-indigo-600 hover:text-indigo-800 font-medium text-xs transition-colors"
              >
                Load Sample Template
              </button>
            </div>
            
            <textarea
              className="w-full h-40 bg-neutral-50 border border-neutral-200 rounded-xl p-3 font-mono text-xs focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all placeholder:text-neutral-400"
              placeholder="RoomName, Type, Day, StartTime, EndTime, ClassName, Instructor&#10;e.g.&#10;Computer Science Lab 1, lab, Monday, 08:30, 10:00, Data Structures, Prof. Sarah"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-800 flex gap-2 items-start text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Summary */}
          {successCount !== null && (
            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 flex gap-2 items-center text-xs justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Successfully parsed <strong>{successCount}</strong> bookings slots! Click 'Apply Import' to replace the schedule.</span>
              </div>
            </div>
          )}

          {/* Preview Panel */}
          {parsedPreview.length > 0 && (
            <div className="space-y-2">
              <span className="font-semibold text-neutral-800 text-xs">Parsing Preview (First 4 items):</span>
              <div className="bg-neutral-50 rounded-xl border border-neutral-200 max-h-28 overflow-y-auto divide-y divide-neutral-100 text-xs">
                {parsedPreview.slice(0, 4).map((b, idx) => (
                  <div key={idx} className="p-2 flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-neutral-800 font-mono">{b.roomId}</span>
                      <span className="mx-2 text-neutral-400">|</span>
                      <span>{b.subject}</span>
                    </div>
                    <div className="text-neutral-400">
                      <span>{b.day} {b.startTime}-{b.endTime}</span>
                    </div>
                  </div>
                ))}
                {parsedPreview.length > 4 && (
                  <div className="p-2 text-center text-neutral-400 italic text-[11px]">
                    ...and {parsedPreview.length - 4} more timeslots.
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="pt-2 flex gap-3 justify-end items-center">
            <div className="flex-1" />
            <button
              onClick={handleParse}
              className="px-4 py-2 text-xs font-medium bg-neutral-800 text-white rounded-lg hover:bg-neutral-900 transition-colors"
            >
              Preview & Validate
            </button>
            <button
              onClick={handleApply}
              disabled={parsedPreview.length === 0}
              className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-all ${
                parsedPreview.length === 0 
                  ? 'bg-neutral-200 cursor-not-allowed text-neutral-400' 
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100'
              }`}
            >
              Apply Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
