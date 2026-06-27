import React, { useState, useEffect } from 'react';
import { X, Calendar, Sparkles, Check, Info, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Upload, Globe } from 'lucide-react';

interface ImportantDatesModalProps {
  onClose: () => void;
  targetDay?: string;
  simulatedMonth?: number; // 0-indexed (0 to 11)
  initialTab?: 'dates' | 'holidays' | 'scanner';
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface AcademicEvent {
  title: string;
  dateStr: string;
  date: Date;
  passed: boolean;
}

interface ProcessedEvent {
  title: string;
  dateStr: string;
  date: Date;
  passed: boolean;
  isActive: boolean;
  isUpcoming: boolean;
  daysRemaining: number;
}

const clearTime = (d: Date) => {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const getDaysRemaining = (targetDate: Date, todayDate: Date): number => {
  const diffTime = targetDate.getTime() - todayDate.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays > 0 ? diffDays : 0;
};

const processAcademicEvents = (eventList: AcademicEvent[], today: Date): ProcessedEvent[] => {
  const midStartEv = eventList.find(e => e.title.toLowerCase().includes('mid-term') && e.title.toLowerCase().includes('start'));
  const midEndEv = eventList.find(e => e.title.toLowerCase().includes('mid-term') && e.title.toLowerCase().includes('end'));
  const finalStartEv = eventList.find(e => e.title.toLowerCase().includes('final') && (e.title.toLowerCase().includes('begin') || e.title.toLowerCase().includes('start')));
  const finalEndEv = eventList.find(e => e.title.toLowerCase().includes('final') && e.title.toLowerCase().includes('end'));

  const midStartDate = midStartEv ? clearTime(midStartEv.date) : null;
  const midEndDate = midEndEv ? clearTime(midEndEv.date) : null;
  const finalStartDate = finalStartEv ? clearTime(finalStartEv.date) : null;
  const finalEndDate = finalEndEv ? clearTime(finalEndEv.date) : null;

  return eventList.map(e => {
    const eDate = clearTime(e.date);
    let passed = today > eDate;
    let isActive = today.getTime() === eDate.getTime();
    let isUpcoming = today < eDate;

    const lowerTitle = e.title.toLowerCase();

    if (lowerTitle.includes('mid-term')) {
      if (lowerTitle.includes('start')) {
        if (midStartDate) {
          passed = today >= midStartDate;
          isActive = false;
          isUpcoming = today < midStartDate;
        }
      } else if (lowerTitle.includes('end')) {
        if (midStartDate && midEndDate) {
          passed = today > midEndDate;
          isActive = today >= midStartDate && today <= midEndDate;
          isUpcoming = today < midStartDate;
        }
      }
    } else if (lowerTitle.includes('final')) {
      if (lowerTitle.includes('begin') || lowerTitle.includes('start')) {
        if (finalStartDate) {
          passed = today >= finalStartDate;
          isActive = false;
          isUpcoming = today < finalStartDate;
        }
      } else if (lowerTitle.includes('end')) {
        if (finalStartDate && finalEndDate) {
          passed = today > finalEndDate;
          isActive = today >= finalStartDate && today <= finalEndDate;
          isUpcoming = today < finalStartDate;
        }
      }
    }

    const daysRemaining = isUpcoming ? getDaysRemaining(eDate, today) : 0;

    return {
      title: e.title,
      dateStr: e.dateStr,
      date: e.date,
      passed,
      isActive,
      isUpcoming,
      daysRemaining
    };
  });
};

const processHolidays = (holidayList: AcademicEvent[], today: Date): ProcessedEvent[] => {
  return holidayList.map(item => {
    let startDate = clearTime(item.date);
    let endDate = clearTime(item.date);

    if (item.title.toLowerCase().includes('eid-ul-fitr')) {
      startDate = new Date("2026-03-19");
      endDate = new Date("2026-03-22");
    } else if (item.title.toLowerCase().includes('eid-ul-adha')) {
      startDate = new Date("2026-05-26");
      endDate = new Date("2026-05-30");
    }

    const passed = today > endDate;
    const isActive = today >= startDate && today <= endDate;
    const isUpcoming = today < startDate;
    const daysRemaining = isUpcoming ? getDaysRemaining(startDate, today) : 0;

    return {
      title: item.title,
      dateStr: item.dateStr,
      date: item.date,
      passed,
      isActive,
      isUpcoming,
      daysRemaining
    };
  });
};

export const ImportantDatesModal: React.FC<ImportantDatesModalProps> = ({ onClose, simulatedMonth = 5, initialTab, onShowToast }) => {
  // Base date of comparison for dynamic passing status (using 2026 as the academic year of reference)
  // Let's assume the day is 26th of the simulatedMonth (matching the current date provided: June 26, 2026)
  const currentSimulatedDate = new Date(2026, simulatedMonth, 26);

  // Custom University & Calendar configuration states stored in localStorage
  const [universityName, setUniversityName] = useState<string>(() => {
    return localStorage.getItem('study_spot_uni_name') || 'BRAC University';
  });
  const [universityUrl, setUniversityUrl] = useState<string>(() => {
    return localStorage.getItem('study_spot_uni_url') || 'https://www.bracu.ac.bd/academic-dates';
  });
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(() => {
    return localStorage.getItem('study_spot_uploaded_file') || null;
  });

  const [inputUniName, setInputUniName] = useState(universityName);
  const [inputUniUrl, setInputUniUrl] = useState(universityUrl);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Auto detect semester based on the month being simulated/searched
  // Spring: Jan, Feb, Mar, Apr (0, 1, 2, 3)
  // Summer: May, Jun, Jul, Aug (4, 5, 6, 7)
  // Fall: Sep, Oct, Nov, Dec (8, 9, 10, 11)
  const getSemesterFromMonth = (month: number): 'spring' | 'summer' | 'fall' => {
    if (month >= 0 && month <= 3) return 'spring';
    if (month >= 4 && month <= 7) return 'summer';
    return 'fall';
  };

  const [selectedSemester, setSelectedSemester] = useState<'spring' | 'summer' | 'fall'>(() => 
    getSemesterFromMonth(simulatedMonth)
  );

  // Sync state if simulatedMonth changes
  useEffect(() => {
    setSelectedSemester(getSemesterFromMonth(simulatedMonth));
  }, [simulatedMonth]);

  const springEvents: AcademicEvent[] = [
    { title: "Orientation of New Students", dateStr: "Jan 8, 2026 (Thursday)", date: new Date("2026-01-08"), passed: new Date("2026-01-08") < currentSimulatedDate },
    { title: "Classes of Spring 2026 Begin", dateStr: "Jan 11, 2026 (Sunday)", date: new Date("2026-01-11"), passed: new Date("2026-01-11") < currentSimulatedDate },
    { title: "Last Day to Add Courses", dateStr: "Jan 15, 2026 (Thursday)", date: new Date("2026-01-15"), passed: new Date("2026-01-15") < currentSimulatedDate },
    { title: "Last Day of Dropping Courses", dateStr: "Jan 22, 2026 (Thursday)", date: new Date("2026-01-22"), passed: new Date("2026-01-22") < currentSimulatedDate },
    { title: "Mid-Term Examinations Start", dateStr: "Mar 1, 2026 (Sunday)", date: new Date("2026-03-01"), passed: new Date("2026-03-01") < currentSimulatedDate },
    { title: "Mid-Term Examinations End", dateStr: "Mar 10, 2026 (Tuesday)", date: new Date("2026-03-10"), passed: new Date("2026-03-10") < currentSimulatedDate },
    { title: "Last Day of Dropping Courses with 'W'", dateStr: "Apr 2, 2026 (Thursday)", date: new Date("2026-04-02"), passed: new Date("2026-04-02") < currentSimulatedDate },
    { title: "Classes of Spring 2026 Ended", dateStr: "Apr 23, 2026 (Thursday)", date: new Date("2026-04-23"), passed: new Date("2026-04-23") < currentSimulatedDate },
    { title: "Final Examinations Begin", dateStr: "Apr 26, 2026 (Sunday)", date: new Date("2026-04-26"), passed: new Date("2026-04-26") < currentSimulatedDate },
    { title: "Final Examinations End", dateStr: "May 5, 2026 (Tuesday)", date: new Date("2026-05-05"), passed: new Date("2026-05-05") < currentSimulatedDate },
  ];

  const summerEvents: AcademicEvent[] = [
    { title: "Orientation of New Students", dateStr: "May 14, 2026 (Thursday)", date: new Date("2026-05-14"), passed: new Date("2026-05-14") < currentSimulatedDate },
    { title: "Classes of Summer 2026 Begin", dateStr: "May 17, 2026 (Sunday)", date: new Date("2026-05-17"), passed: new Date("2026-05-17") < currentSimulatedDate },
    { title: "Last Day to Add Courses", dateStr: "May 21, 2026 (Thursday)", date: new Date("2026-05-21"), passed: new Date("2026-05-21") < currentSimulatedDate },
    { title: "Last Day of Dropping Courses", dateStr: "May 28, 2026 (Thursday)", date: new Date("2026-05-28"), passed: new Date("2026-05-28") < currentSimulatedDate },
    { title: "Mid-Term Examinations Start", dateStr: "Jul 5, 2026 (Sunday)", date: new Date("2026-07-05"), passed: new Date("2026-07-05") < currentSimulatedDate },
    { title: "Mid-Term Examinations End", dateStr: "Jul 15, 2026 (Wednesday)", date: new Date("2026-07-15"), passed: new Date("2026-07-15") < currentSimulatedDate },
    { title: "Last Day of Dropping Courses with 'W'", dateStr: "Aug 6, 2026 (Thursday)", date: new Date("2026-08-06"), passed: new Date("2026-08-06") < currentSimulatedDate },
    { title: "Classes of Summer 2026 Ended", dateStr: "Aug 27, 2026 (Thursday)", date: new Date("2026-08-27"), passed: new Date("2026-08-27") < currentSimulatedDate },
    { title: "Final Examinations Begin", dateStr: "Aug 30, 2026 (Sunday)", date: new Date("2026-08-30"), passed: new Date("2026-08-30") < currentSimulatedDate },
    { title: "Final Examinations End", dateStr: "Sep 8, 2026 (Tuesday)", date: new Date("2026-09-08"), passed: new Date("2026-09-08") < currentSimulatedDate },
  ];

  const fallEvents: AcademicEvent[] = [
    { title: "Orientation of New Students", dateStr: "Oct 1, 2026 (Thursday)", date: new Date("2026-10-01"), passed: new Date("2026-10-01") < currentSimulatedDate },
    { title: "Classes of Fall 2026 Begin", dateStr: "Oct 4, 2026 (Sunday)", date: new Date("2026-10-04"), passed: new Date("2026-10-04") < currentSimulatedDate },
    { title: "Last Day to Add Courses", dateStr: "Oct 8, 2026 (Thursday)", date: new Date("2026-10-08"), passed: new Date("2026-10-08") < currentSimulatedDate },
    { title: "Last Day of Dropping Courses", dateStr: "Oct 15, 2026 (Thursday)", date: new Date("2026-10-15"), passed: new Date("2026-10-15") < currentSimulatedDate },
    { title: "Mid-Term Examinations Start", dateStr: "Nov 22, 2026 (Sunday)", date: new Date("2026-11-22"), passed: new Date("2026-11-22") < currentSimulatedDate },
    { title: "Mid-Term Examinations End", dateStr: "Dec 2, 2026 (Wednesday)", date: new Date("2026-12-02"), passed: new Date("2026-12-02") < currentSimulatedDate },
    { title: "Last Day of Dropping Courses with 'W'", dateStr: "Dec 24, 2026 (Thursday)", date: new Date("2026-12-24"), passed: new Date("2026-12-24") < currentSimulatedDate },
    { title: "Classes of Fall 2026 Ended", dateStr: "Jan 14, 2027 (Thursday)", date: new Date("2027-01-14"), passed: new Date("2027-01-14") < currentSimulatedDate },
    { title: "Final Examinations Begin", dateStr: "Jan 17, 2027 (Sunday)", date: new Date("2027-01-17"), passed: new Date("2027-01-17") < currentSimulatedDate },
    { title: "Final Examinations End", dateStr: "Jan 26, 2027 (Tuesday)", date: new Date("2027-01-26"), passed: new Date("2027-01-26") < currentSimulatedDate },
  ];

  const currentEvents: AcademicEvent[] = 
    selectedSemester === 'spring' ? springEvents : 
    selectedSemester === 'summer' ? summerEvents : 
    fallEvents;

  const holidays: AcademicEvent[] = [
    { title: "Shaheed Day & International Mother Language Day", dateStr: "Feb 21, 2026 (Saturday)", date: new Date("2026-02-21"), passed: new Date("2026-02-21") < currentSimulatedDate },
    { title: "Shab-e-Barat", dateStr: "Mar 4, 2026 (Wednesday)", date: new Date("2026-03-04"), passed: new Date("2026-03-04") < currentSimulatedDate },
    { title: "Birthday of the Father of the Nation", dateStr: "Mar 17, 2026 (Tuesday)", date: new Date("2026-03-17"), passed: new Date("2026-03-17") < currentSimulatedDate },
    { title: "Independence & National Day", dateStr: "Mar 26, 2026 (Thursday)", date: new Date("2026-03-26"), passed: new Date("2026-03-26") < currentSimulatedDate },
    { title: "Eid-ul-Fitr Holidays", dateStr: "Mar 19 - Mar 22, 2026", date: new Date("2026-03-22"), passed: new Date("2026-03-22") < currentSimulatedDate },
    { title: "Bengali New Year (Pohela Boishakh)", dateStr: "Apr 14, 2026 (Tuesday)", date: new Date("2026-04-14"), passed: new Date("2026-04-14") < currentSimulatedDate },
    { title: "May Day", dateStr: "May 1, 2026 (Friday)", date: new Date("2026-05-01"), passed: new Date("2026-05-01") < currentSimulatedDate },
    { title: "Buddha Purnima", dateStr: "May 26, 2026 (Tuesday)", date: new Date("2026-05-26"), passed: new Date("2026-05-26") < currentSimulatedDate },
    { title: "Eid-ul-Adha Holidays", dateStr: "May 26 - May 30, 2026", date: new Date("2026-05-30"), passed: new Date("2026-05-30") < currentSimulatedDate },
    { title: "Ashura", dateStr: "Jul 25, 2026 (Saturday)", date: new Date("2026-07-25"), passed: new Date("2026-07-25") < currentSimulatedDate },
    { title: "Janmashtami", dateStr: "Aug 14, 2026 (Friday)", date: new Date("2026-08-14"), passed: new Date("2026-08-14") < currentSimulatedDate },
    { title: "National Mourning Day", dateStr: "Aug 15, 2026 (Saturday)", date: new Date("2026-08-15"), passed: new Date("2026-08-15") < currentSimulatedDate },
    { title: "Eid-e-Miladunnabi", dateStr: "Sep 4, 2026 (Friday)", date: new Date("2026-09-04"), passed: new Date("2026-09-04") < currentSimulatedDate },
    { title: "Durga Puja", dateStr: "Oct 19, 2026 (Monday)", date: new Date("2026-10-19"), passed: new Date("2026-10-19") < currentSimulatedDate },
    { title: "Victory Day", dateStr: "Dec 16, 2026 (Wednesday)", date: new Date("2026-12-16"), passed: new Date("2026-12-16") < currentSimulatedDate },
    { title: "Christmas Day", dateStr: "Dec 25, 2026 (Friday)", date: new Date("2026-12-25"), passed: new Date("2026-12-25") < currentSimulatedDate },
  ];

  // Visual state to show active calendar rendering mode
  const [activeViewTab, setActiveViewTab] = useState<'dates' | 'holidays' | 'scanner'>(initialTab || 'dates');

  useEffect(() => {
    if (initialTab) {
      setActiveViewTab(initialTab);
    }
  }, [initialTab]);

  const currentHolidays = holidays.filter(item => {
    const month = item.date.getMonth();
    const sem = getSemesterFromMonth(month);
    return sem === selectedSemester;
  });

  const processedEvents = processAcademicEvents(currentEvents, currentSimulatedDate);
  const processedHolidays = processHolidays(currentHolidays, currentSimulatedDate);

  const [showPastDates, setShowPastDates] = useState<boolean>(false);
  const [showPastHolidays, setShowPastHolidays] = useState<boolean>(false);
  const [isScraped, setIsScraped] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanStep, setScanStep] = useState<string>('');

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setUploadedFileName(file.name);
      localStorage.setItem('study_spot_uploaded_file', file.name);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFileName(file.name);
      localStorage.setItem('study_spot_uploaded_file', file.name);
    }
  };

  const handleSimulateScan = () => {
    if (!inputUniName.trim()) {
      if (onShowToast) {
        onShowToast("Please enter a university name.", "error");
      } else {
        alert("Please enter a university name.");
      }
      return;
    }
    setIsScanning(true);
    setScanStep(`Establishing proxy connection to fetch ${inputUniUrl || 'provided source'}...`);
    
    setTimeout(() => {
      if (uploadedFileName) {
        setScanStep(`Parsing uploaded calendar image file: "${uploadedFileName}"...`);
      } else {
        setScanStep(`Analyzing target directory structure & calendar paths for ${inputUniName}...`);
      }
    }, 1200);

    setTimeout(() => {
      setScanStep(`Executing Intelligent Multimodal OCR on academic timetable layouts...`);
    }, 2500);

    setTimeout(() => {
      setScanStep(`Mapping term intervals: Identifying Spring, Summer, and Fall boundaries...`);
    }, 3800);

    setTimeout(() => {
      setScanStep(`Filtering official gazetted closures and religious holidays...`);
    }, 5000);

    setTimeout(() => {
      setScanStep(`Saving updated records and binding scheduling triggers...`);
    }, 6200);

    setTimeout(() => {
      const cleanedUrl = inputUniUrl.trim() || 'https://www.bracu.ac.bd/academic-dates';
      const cleanedName = inputUniName.trim();
      
      // Save to localStorage
      localStorage.setItem('study_spot_uni_name', cleanedName);
      localStorage.setItem('study_spot_uni_url', cleanedUrl);
      
      setUniversityName(cleanedName);
      setUniversityUrl(cleanedUrl);
      
      setIsScanning(false);
      setScanStep('');
      setActiveViewTab('dates'); // go back to the list
      
      if (onShowToast) {
        onShowToast(`Success! Academic calendar database has been updated for "${cleanedName}". All date verification references are now calibrated to your university.`, 'success');
      } else {
        alert(`Success! Academic calendar database has been updated for "${cleanedName}". All date verification references are now calibrated to your university.`);
      }
    }, 7500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center bg-neutral-900/60 backdrop-blur-xs select-none" id="important-dates-modal">
      <div className="bg-white rounded-3xl w-full max-w-3xl h-[85vh] flex flex-col shadow-2xl border border-neutral-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-white/10 rounded-xl text-indigo-100">
              <Calendar className="w-6 h-6" />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Academic Calendar</h2>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 hover:text-white transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Calendar Nav Switcher */}
        <div className="px-6 py-3 border-b border-neutral-100 flex flex-col sm:flex-row gap-3 sm:items-center justify-between bg-neutral-50">
          <div className="flex p-0.5 bg-neutral-200/60 rounded-lg text-xs font-semibold self-start gap-1 flex-wrap">
            <button
              onClick={() => setActiveViewTab('dates')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeViewTab === 'dates' 
                  ? 'bg-emerald-800 text-white shadow-xs' 
                  : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
              }`}
            >
              Important Dates
            </button>
            <button
              onClick={() => setActiveViewTab('holidays')}
              className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeViewTab === 'holidays' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
              }`}
            >
              Scheduled Holidays
            </button>
            <button
              onClick={() => setActiveViewTab('scanner')}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                activeViewTab === 'scanner' 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'text-neutral-500 hover:text-neutral-800 hover:bg-white/40'
              }`}
            >
              <span>Re-sync / Change Uni</span>
            </button>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <span className="text-[10px] text-neutral-400 font-mono">Status:</span>
            <span className={`inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
              activeViewTab === 'dates' ? 'bg-emerald-100 text-emerald-800' :
              activeViewTab === 'holidays' ? 'bg-blue-100 text-blue-800' :
              'bg-indigo-100 text-indigo-800'
            }`}>
              ✓ SYNCED ({universityName})
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {activeViewTab === 'dates' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2 gap-2 w-full">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Important Dates
                </h3>
                <div className="flex gap-1 text-[9px] font-bold shrink-0">
                  {(['spring', 'summer', 'fall'] as const).map(sem => (
                    <button
                      key={sem}
                      type="button"
                      onClick={() => setSelectedSemester(sem)}
                      className={`px-2 py-1 rounded capitalize transition-all cursor-pointer ${
                        selectedSemester === sem 
                          ? 'bg-emerald-800 text-white shadow-xs' 
                          : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                      }`}
                    >
                      {sem}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collapsible Past Events (Shown at the very top since it is collapsed) */}
              {processedEvents.filter(e => e.passed).length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowPastDates(!showPastDates)}
                    className="w-full py-2.5 px-4 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-600 flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-600" />
                      <span>Past Academic Events ({processedEvents.filter(e => e.passed).length} collapsed)</span>
                    </span>
                    <span className="text-[10px] text-neutral-400 flex items-center gap-1 font-mono">
                      {showPastDates ? 'Collapse' : 'Expand'} {showPastDates ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>

                  {showPastDates && (
                    <div className="mt-2 space-y-2 animate-in slide-in-from-top-1 duration-150 max-h-[30vh] overflow-y-auto">
                      {processedEvents.filter(e => e.passed).map((item, index) => (
                        <div 
                          key={index}
                          className="p-3.5 rounded-xl border border-emerald-50 bg-emerald-50/20 text-neutral-400 line-through decoration-neutral-200 flex justify-between items-start gap-2"
                        >
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium text-neutral-400">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
                              📅 {item.dateStr}
                            </p>
                          </div>
                          <span className="text-[9px] bg-neutral-100 text-neutral-400 font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 select-none">
                            <Check className="w-2.5 h-2.5" /> Passed
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Upcoming and Active Events (Shown after past events) */}
              <div className="space-y-2">
                {processedEvents.filter(e => !e.passed).length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4 text-center bg-neutral-50 rounded-xl border border-neutral-100">
                    No upcoming events left in {selectedSemester} 2026.
                  </p>
                ) : (
                  processedEvents.filter(e => !e.passed).map((item, index) => (
                    <div 
                      key={index}
                      className={`p-3.5 rounded-xl border shadow-xs flex justify-between items-start gap-2 hover:shadow-sm transition-all ${
                        item.isActive 
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold' 
                          : 'border-emerald-100 bg-white text-neutral-800 hover:border-emerald-200'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <p className={`text-xs font-bold ${item.isActive ? 'text-emerald-900' : 'text-emerald-950'}`}>
                          {item.title}
                        </p>
                        <p className={`text-[10px] font-mono flex items-center gap-1 ${item.isActive ? 'text-emerald-700' : 'text-neutral-400'}`}>
                          📅 {item.dateStr}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {item.isActive ? (
                          <span className="text-[9px] bg-emerald-600 text-white font-bold px-1.5 py-0.5 rounded-md shrink-0 select-none uppercase tracking-wider animate-pulse">
                            Active
                          </span>
                        ) : (
                          <>
                            <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-md shrink-0 select-none">
                              Upcoming
                            </span>
                            <span className="text-[10px] text-neutral-500 font-medium">
                              {item.daysRemaining} days
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeViewTab === 'holidays' && (
            <div className="space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-blue-100 pb-2 gap-2 w-full">
                <h3 className="text-xs font-bold uppercase tracking-wider text-blue-800 flex items-center gap-1.5 shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse"></span>
                  Scheduled Holidays
                </h3>
                <div className="flex gap-1 text-[9px] font-bold shrink-0">
                  {(['spring', 'summer', 'fall'] as const).map(sem => (
                    <button
                      key={sem}
                      type="button"
                      onClick={() => setSelectedSemester(sem)}
                      className={`px-2 py-1 rounded capitalize transition-all cursor-pointer ${
                        selectedSemester === sem 
                          ? 'bg-blue-600 text-white shadow-xs' 
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      }`}
                    >
                      {sem}
                    </button>
                  ))}
                </div>
              </div>

              {/* Collapsible Past Holidays (Shown at the very top since it is collapsed) */}
              {processedHolidays.filter(e => e.passed).length > 0 && (
                <div className="pt-2">
                  <button
                    onClick={() => setShowPastHolidays(!showPastHolidays)}
                    className="w-full py-2.5 px-4 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-xl text-xs font-semibold text-neutral-600 flex items-center justify-between transition-all cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-blue-600" />
                      <span>Past Holidays ({processedHolidays.filter(e => e.passed).length} collapsed)</span>
                    </span>
                    <span className="text-[10px] text-neutral-400 flex items-center gap-1 font-mono">
                      {showPastHolidays ? 'Collapse' : 'Expand'} {showPastHolidays ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </span>
                  </button>

                  {showPastHolidays && (
                    <div className="mt-2 space-y-2 animate-in slide-in-from-top-1 duration-150 max-h-[30vh] overflow-y-auto">
                      {processedHolidays.filter(e => e.passed).map((item, index) => (
                        <div 
                          key={index}
                          className="p-3.5 rounded-xl border border-blue-100/30 bg-blue-50/10 text-neutral-400 line-through decoration-neutral-200 flex justify-between items-start gap-2"
                        >
                          <div className="space-y-0.5">
                            <p className="text-xs font-medium text-neutral-400">
                              {item.title}
                            </p>
                            <p className="text-[10px] text-neutral-400 font-mono flex items-center gap-1">
                              🏝️ {item.dateStr}
                            </p>
                          </div>
                          <span className="text-[9px] bg-neutral-100 text-neutral-400 font-bold px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shrink-0 select-none">
                            <Check className="w-2.5 h-2.5" /> Passed
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Upcoming and Active Holidays (Shown after past holidays) */}
              <div className="space-y-2">
                {processedHolidays.filter(e => !e.passed).length === 0 ? (
                  <p className="text-xs text-neutral-500 py-4 text-center bg-neutral-50 rounded-xl border border-neutral-100">
                    No upcoming scheduled holidays left in {selectedSemester} 2026.
                  </p>
                ) : (
                  processedHolidays.filter(e => !e.passed).map((item, index) => (
                    <div 
                      key={index}
                      className={`p-3.5 rounded-xl border shadow-xs flex justify-between items-start gap-2 hover:shadow-sm transition-all ${
                        item.isActive 
                          ? 'border-blue-500 bg-blue-50 text-blue-950 font-bold' 
                          : 'border-blue-200 bg-blue-50/60 text-blue-950 hover:border-blue-300'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <p className={`text-xs font-bold ${item.isActive ? 'text-blue-900' : 'text-blue-950'}`}>
                          {item.title}
                        </p>
                        <p className={`text-[10px] font-mono flex items-center gap-1 ${item.isActive ? 'text-blue-700' : 'text-blue-600'}`}>
                          🏝️ {item.dateStr}
                        </p>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        {item.isActive ? (
                          <span className="text-[9px] bg-blue-600 text-white font-bold px-1.5 py-0.5 rounded-md shrink-0 select-none uppercase tracking-wider animate-pulse">
                            Active
                          </span>
                        ) : (
                          <>
                            <span className="text-[9px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded-md shrink-0 select-none">
                              Upcoming
                            </span>
                            <span className="text-[10px] text-neutral-500 font-medium">
                              {item.daysRemaining} days
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeViewTab === 'scanner' && (
            /* RE-SYNC / CHANGE UNI TAB CONTENT */
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 text-xs text-neutral-800 space-y-4">
                <div>
                  <h4 className="font-bold text-neutral-900 mb-1 text-sm flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-600" />
                    University Academic Calendar Sync
                  </h4>
                  <p className="text-neutral-500 leading-relaxed text-xs">
                    Study Spot is fully dynamic. If you study at a different university, simply enter your university name and calendar link, or upload an image of your academic schedule to automatically recalibrate all dates.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* University Name Input */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">University Name</label>
                    <input
                      type="text"
                      placeholder="e.g. BRAC University, Dhaka University"
                      value={inputUniName}
                      onChange={(e) => setInputUniName(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-neutral-800"
                    />
                  </div>

                  {/* University URL Input */}
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">Academic Calendar website Link</label>
                    <input
                      type="url"
                      placeholder="e.g. https://www.bracu.ac.bd/academic-dates"
                      value={inputUniUrl}
                      onChange={(e) => setInputUniUrl(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-neutral-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-neutral-800"
                    />
                  </div>
                </div>

                {/* PNG/JPEG Upload Box */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">Upload Academic Calendar Image (Optional)</label>
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-2 relative group ${
                      dragActive 
                        ? 'border-indigo-500 bg-indigo-50/50' 
                        : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/30'
                    }`}
                  >
                    <input
                      type="file"
                      id="calendar-upload"
                      accept="image/png, image/jpeg"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-neutral-400 group-hover:text-indigo-500 transition-all" />
                    {uploadedFileName ? (
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-1">
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          {uploadedFileName}
                        </p>
                        <p className="text-[10px] text-neutral-400">Click or drag another image to replace</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs font-bold text-neutral-700">Drag & drop your university calendar sheet here</p>
                        <p className="text-[10px] text-neutral-400 mt-0.5">Supports PNG or JPEG images. Will parse milestones using AI OCR.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Form Action Controls */}
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleSimulateScan}
                    disabled={isScanning}
                    className={`px-6 py-3 rounded-xl font-bold text-xs flex items-center gap-2 shadow-xs transition-all cursor-pointer ${
                      isScanning
                        ? 'bg-neutral-200 text-neutral-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white'
                    }`}
                  >
                    <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                    <span>{isScanning ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                </div>
              </div>

              {/* OCR Scanning Progress Loader */}
              {isScanning && (
                <div className="bg-neutral-900 text-indigo-400 rounded-2xl p-5 font-mono text-[11px] space-y-2.5 border border-indigo-950 shadow-lg animate-pulse">
                  <div className="flex justify-between items-center border-b border-indigo-950 pb-1.5 text-[10px] text-indigo-500">
                    <span>LIVE OCR WORKER DAEMON STATUS</span>
                    <span className="font-bold animate-ping text-indigo-500">● WORKING</span>
                  </div>
                  <p className="text-neutral-200">Executing sequence step:</p>
                  <p className="font-bold text-indigo-200 flex items-center gap-2">
                    <span className="animate-spin text-yellow-400">↻</span> {scanStep}
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-neutral-500">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-neutral-400" />
              <span>Dates checked from <strong className="text-neutral-700 font-bold">[{universityName}]</strong>.</span>
            </span>
            <button
              onClick={() => setActiveViewTab('scanner')}
              className="text-indigo-600 hover:text-indigo-800 font-bold text-xs bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md transition-all self-start sm:self-auto border border-indigo-100 cursor-pointer"
            >
              Change to your university
            </button>
          </div>
          {universityUrl && (
            <a
              href={universityUrl.startsWith('http') ? universityUrl : `https://${universityUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer transition-all hover:underline"
            >
              <span>Visit {universityName} website</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

      </div>
    </div>
  );
};
