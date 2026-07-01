import React, { useState } from 'react';
import { User, WeekDayName, WeeklySchedule, WeeklyTimeWindow } from '../types';
import { CalendarDays, Plus, Save, Settings, Trash2 } from 'lucide-react';
import { updateDoctorWeeklySchedule } from '../services/clinicService';
import { updateStaffProfile } from '@/services/authService';

interface AvailabilityManagerProps {
  doctor: User;
  onSave?: (schedule: WeeklySchedule) => void;
  isAdmin?: boolean;
}

const WEEK_DAYS: WeekDayName[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const fallbackSchedule = (doctor: User): WeeklySchedule => {
  if (doctor.weeklySchedule && Object.keys(doctor.weeklySchedule).length > 0) return doctor.weeklySchedule;
  const schedule: WeeklySchedule = {};
  doctor.availableDays?.forEach((day) => {
    schedule[day as WeekDayName] = [{
      start: doctor.workingHours?.start || '09:00',
      end: doctor.workingHours?.end || '17:00'
    }];
  });
  return schedule;
};

const emptyWindow = (): WeeklyTimeWindow => ({ start: '09:00', end: '12:00' });

const DoctorAvailabilityManager: React.FC<AvailabilityManagerProps> = ({ doctor, onSave, isAdmin }) => {
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklySchedule>(() => fallbackSchedule(doctor));
  const [isSaving, setIsSaving] = useState(false);

  React.useEffect(() => {
    setWeeklySchedule(fallbackSchedule(doctor));
  }, [doctor]);

  const addWindow = (day: WeekDayName) => {
    setWeeklySchedule((current) => ({
      ...current,
      [day]: [...(current[day] || []), emptyWindow()]
    }));
  };

  const updateWindow = (day: WeekDayName, index: number, field: keyof WeeklyTimeWindow, value: string) => {
    setWeeklySchedule((current) => ({
      ...current,
      [day]: (current[day] || []).map((window, windowIndex) =>
        windowIndex === index ? { ...window, [field]: value } : window
      )
    }));
  };

  const removeWindow = (day: WeekDayName, index: number) => {
    setWeeklySchedule((current) => {
      const nextWindows = (current[day] || []).filter((_, windowIndex) => windowIndex !== index);
      const next = { ...current };
      if (nextWindows.length > 0) next[day] = nextWindows;
      else delete next[day];
      return next;
    });
  };

  const cleanSchedule = (): WeeklySchedule => {
    const cleaned: WeeklySchedule = {};
    WEEK_DAYS.forEach((day) => {
      const windows = (weeklySchedule[day] || []).filter((window) => window.start && window.end && window.start < window.end);
      if (windows.length > 0) cleaned[day] = windows;
    });
    return cleaned;
  };

  const handleSave = async () => {
    setIsSaving(true);
    const schedule = cleanSchedule();
    try {
      if (isAdmin) {
        await updateDoctorWeeklySchedule(doctor.id, schedule);
      } else {
        await updateStaffProfile({
          name: doctor.name,
          phoneNo: doctor.patientProfile?.phoneNo || '',
          profession: doctor.patientProfile?.profession || '',
          address: doctor.patientProfile?.address || '',
          department: doctor.department || '',
          specialty: doctor.specialty || '',
          experience: doctor.experience || '',
          weeklySchedule: schedule
        });
      }
      setWeeklySchedule(schedule);
      onSave?.(schedule);
      alert(`Weekly schedule saved for ${doctor.name}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {isAdmin ? `Manage Weekly Schedule for ${doctor.name}` : 'Set Your Weekly Schedule'}
          </h3>
          <p className="text-gray-500">Add one or more time ranges for each weekday. Example: Monday 09:00-12:00, 14:00-16:00, 17:00-19:00.</p>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition flex items-center shadow-lg shadow-sky-100 disabled:opacity-60"
        >
          <Save size={18} className="mr-2" /> {isSaving ? 'Saving...' : 'Save Schedule'}
        </button>
      </div>

      <div className="space-y-4">
        {WEEK_DAYS.map((day) => {
          const windows = weeklySchedule[day] || [];
          return (
            <div key={day} className="rounded-3xl border border-gray-100 bg-gray-50/60 p-5">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="md:w-36 flex items-center font-black text-gray-900">
                  <CalendarDays size={18} className="mr-2 text-sky-600" /> {day}
                </div>
                <div className="flex-1 space-y-3">
                  {windows.length === 0 ? (
                    <div className="text-sm font-bold text-gray-400 bg-white rounded-2xl px-4 py-3 border border-gray-100">Not available</div>
                  ) : (
                    windows.map((window, index) => (
                      <div key={`${day}-${index}`} className="flex flex-col sm:flex-row gap-3 bg-white rounded-2xl p-3 border border-gray-100">
                        <input
                          type="time"
                          value={window.start}
                          onChange={(event) => updateWindow(day, index, 'start', event.target.value)}
                          className="px-4 py-3 rounded-xl border border-gray-200 font-bold text-gray-900"
                        />
                        <input
                          type="time"
                          value={window.end}
                          onChange={(event) => updateWindow(day, index, 'end', event.target.value)}
                          className="px-4 py-3 rounded-xl border border-gray-200 font-bold text-gray-900"
                        />
                        <button
                          type="button"
                          onClick={() => removeWindow(day, index)}
                          className="px-4 py-3 rounded-xl bg-red-50 text-red-600 font-bold hover:bg-red-100 flex items-center justify-center"
                        >
                          <Trash2 size={16} className="mr-2" /> Remove
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => addWindow(day)}
                  className="px-4 py-3 rounded-xl bg-sky-50 text-sky-700 font-black hover:bg-sky-100 flex items-center justify-center"
                >
                  <Plus size={16} className="mr-2" /> Add Time
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-10 p-6 bg-amber-50 rounded-3xl border border-amber-100 flex items-start space-x-4">
        <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
          <Settings size={20} />
        </div>
        <div>
          <h4 className="font-bold text-amber-900">Important Note</h4>
          <p className="text-sm text-amber-800 leading-relaxed">
            Patient booking slots are generated from these weekly ranges in 15-minute intervals. Existing booked appointments remain unchanged.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DoctorAvailabilityManager;
