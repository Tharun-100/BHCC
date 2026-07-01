
import React, { useState } from 'react';
import { User, Appointment } from '../types';
import { Calendar, Clock, ChevronLeft, ChevronRight, Settings, Save } from 'lucide-react';
import { getDoctorAvailability, upsertDoctorAvailability } from '../services/clinicService';

interface AvailabilityManagerProps {
  doctor: User;
  onSave?: (date: string, slots: string[]) => void;
  isAdmin?: boolean;
}

const GENERATE_SLOTS = () => {
  const slots: string[] = [];
  for (let hour = 9; hour < 18; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
    slots.push(`${hour.toString().padStart(2, '0')}:30`);
  }
  slots.push('18:00');
  return slots;
};

const MOCK_APPOINTMENTS: Appointment[] = [
  { id: '1', patientId: 'p1', patientName: 'Amit Patel', doctorId: 'mock-id', doctorName: 'Dr. John Doe', department: 'General Medicine', date: '2023-10-24', time: '09:00', fee: 600, status: 'Completed', paymentId: 'PAY-101' },
];

const DoctorAvailabilityManager: React.FC<AvailabilityManagerProps> = ({ doctor, onSave, isAdmin }) => {
  const today = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState(today);
  const [availableSlots, setAvailableSlots] = useState<string[]>(doctor.availability?.[today] || ['09:00', '09:30', '10:00', '11:00', '14:00', '15:30']);
  const [isSaving, setIsSaving] = useState(false);

  const allSlots = GENERATE_SLOTS();

  React.useEffect(() => {
    let mounted = true;
    const load = async () => {
      const slots = await getDoctorAvailability(doctor.id, selectedDate);
      if (!mounted) return;
      if (slots.length > 0) {
        setAvailableSlots(slots.sort());
      }
    };
    load().catch(() => null);
    return () => {
      mounted = false;
    };
  }, [doctor.id, selectedDate]);

  const toggleSlot = (slot: string) => {
    if (availableSlots.includes(slot)) {
      setAvailableSlots(availableSlots.filter(s => s !== slot));
    } else {
      setAvailableSlots([...availableSlots, slot].sort());
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await upsertDoctorAvailability(doctor.id, selectedDate, availableSlots);
      if (onSave) onSave(selectedDate, availableSlots);
      alert(`Availability saved for ${doctor.name} on ${selectedDate}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">
            {isAdmin ? `Manage Availability for ${doctor.name}` : 'Set Your Available Slots'}
          </h3>
          <p className="text-gray-500">Click on the time slots to toggle availability for physical consultations (9 AM - 6 PM).</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl p-1 shadow-sm">
            <button className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronLeft size={20} /></button>
            <div className="px-6 font-bold text-gray-900 flex items-center whitespace-nowrap">
              <Calendar className="mr-2 text-sky-500" size={18} /> October 24, 2023
            </div>
            <button className="p-2 hover:bg-gray-100 rounded-xl transition"><ChevronRight size={20} /></button>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition flex items-center shadow-lg shadow-sky-100"
          >
            <Save size={18} className="mr-2" /> {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {allSlots.map(slot => {
          const isSelected = availableSlots.includes(slot);
          const isBooked = MOCK_APPOINTMENTS.some(app => app.time === slot && app.doctorId === doctor.id);
          
          return (
            <button
              key={slot}
              disabled={isBooked}
              onClick={() => toggleSlot(slot)}
              className={`
                p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center space-y-1
                ${isBooked ? 'bg-gray-50 border-gray-100 cursor-not-allowed' : 
                  isSelected ? 'bg-sky-50 border-sky-500 text-sky-700 shadow-sm' : 
                  'bg-white border-gray-100 text-gray-400 hover:border-gray-200'}
              `}
            >
              <Clock size={16} className={isSelected ? 'text-sky-500' : 'text-gray-300'} />
              <span className="font-bold">{slot}</span>
              <span className="text-[10px] font-black uppercase tracking-tighter">
                {isBooked ? 'Booked' : isSelected ? 'Available' : 'Unavailable'}
              </span>
            </button>
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
            {isAdmin 
              ? `You are managing the schedule for ${doctor.name}. Changes will be reflected immediately in the patient booking portal.`
              : "Slots marked as Booked cannot be toggled. If you need to cancel a booked slot, please coordinate with the clinic administration."}
          </p>
        </div>
      </div>
    </div>
  );
};

export default DoctorAvailabilityManager;
