import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { DEPARTMENTS as FALLBACK_DEPARTMENTS, DOCTORS as FALLBACK_DOCTORS } from '../constants';
import { Department, User } from '../types';
import {
  Check,
  ArrowLeft,
  ArrowRight,
  Stethoscope,
  User as UserIcon,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Loader2,
} from 'lucide-react';
import { listDepartments, listDoctorAppointmentsByDate, listDoctors } from '../services/clinicService';

interface BookAppointmentProps {
  user: User | null;
}

const BookAppointment: React.FC<BookAppointmentProps> = ({ user }) => {
  const [departments, setDepartments] = useState<Department[]>(FALLBACK_DEPARTMENTS);
  const [doctors, setDoctors] = useState<User[]>(FALLBACK_DOCTORS);
  const [step, setStep] = useState(1);
  const [selectedDept, setSelectedDept] = useState<Department | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<User | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const navigate = useNavigate();

  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [gatewayFee, setGatewayFee] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  const functions = getFunctions();

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const [dbDepartments, dbDoctors] = await Promise.all([listDepartments(), listDoctors()]);
      if (!mounted) return;
      if (dbDepartments.length > 0) setDepartments(dbDepartments);
      if (dbDoctors.length > 0) setDoctors(dbDoctors);
    };
    load().catch(() => null);
    return () => {
      mounted = false;
    };
  }, []);

  const handleDeptSelect = (dept: Department) => {
    setSelectedDept(dept);
    setSelectedDoc(null);
    setSelectedDate('');
    setSelectedSlot('');
    setStep(2);
  };

  const handleDocSelect = (doc: User) => {
    setSelectedDoc(doc);
    setSelectedDate('');
    setSelectedSlot('');
    setStep(3);
  };

  const handleDateAndSlotConfirm = () => {
    if (selectedDate && selectedSlot && selectedDoc?.fee) {
      const fee = selectedDoc.fee;
      const calculatedGatewayFee = Math.ceil(fee * 0.02);
      setGatewayFee(calculatedGatewayFee);
      setTotalAmount(fee + calculatedGatewayFee);
      setStep(4);
    }
  };

  const handleConfirmAndPay = async () => {
    if (!user || !selectedDoc || !selectedDate || !selectedSlot) return;

    setIsProcessing(true);
    setStep(5);

    const appointmentData = {
      patientName: user.name,
      doctorId: selectedDoc.id,
      doctorName: selectedDoc.name,
      department: selectedDoc.department || selectedDept?.name || 'General Medicine',
      date: selectedDate,
      time: selectedSlot,
      fee: selectedDoc.fee || 0,
    };

    try {
      const createOrder = httpsCallable(functions, 'createPaymentOrder');
      const result: any = await createOrder({ appointmentData });
      const { orderId, gatewayOrderId, amount, amountPaise, currency } = result.data;

      navigate('/payment-gateway', {
        state: {
          orderId,
          gatewayOrderId,
          amount,
          amountPaise,
          currency,
          doctorName: selectedDoc.name,
          appointmentDate: selectedDate,
        },
      });
    } catch (error) {
      console.error('Payment Order Error:', error);
      setIsProcessing(false);
      setStep(4);
      alert('Could not initiate payment. Please try again.');
    }
  };

  const filteredDoctors = doctors.filter((doc) => doc.department === selectedDept?.name);

  const availableDates = useMemo(() => {
    if (!selectedDoc || !selectedDoc.availableDays) return [];

    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
      if (selectedDoc.availableDays.includes(dayName)) {
        dates.push({
          full: d.toISOString().split('T')[0],
          display: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
          day: dayName,
        });
      }
    }
    return dates;
  }, [selectedDoc]);

  const availableSlots = useMemo(() => {
    if (!selectedDoc || !selectedDoc.workingHours) return [];

    const slots = [];
    const [startH, startM] = selectedDoc.workingHours.start.split(':').map(Number);
    const [endH, endM] = selectedDoc.workingHours.end.split(':').map(Number);

    let currentH = startH;
    let currentM = startM;

    while (currentH < endH || (currentH === endH && currentM < endM)) {
      const timeStr = `${currentH.toString().padStart(2, '0')}:${currentM.toString().padStart(2, '0')}`;
      slots.push(timeStr);

      currentM += 30;
      if (currentM >= 60) {
        currentH += 1;
        currentM = 0;
      }
    }
    return slots;
  }, [selectedDoc]);

  useEffect(() => {
    let mounted = true;
    const loadBookedSlots = async () => {
      if (!selectedDoc || !selectedDate) {
        setBookedSlots([]);
        return;
      }
      const rows = await listDoctorAppointmentsByDate(selectedDoc.id, selectedDate);
      if (!mounted) return;
      setBookedSlots(rows.filter((r) => r.status !== 'Cancelled').map((r) => r.time));
    };

    loadBookedSlots().catch(() => setBookedSlots([]));
    return () => {
      mounted = false;
    };
  }, [selectedDoc, selectedDate]);

  const StepIndicator = () => (
    <div className="flex items-center justify-between mb-12 max-w-2xl mx-auto px-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <React.Fragment key={i}>
          <div className="flex flex-col items-center">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                step >= i ? 'bg-sky-600 text-white shadow-lg shadow-sky-200' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {step > i ? <Check size={18} /> : i}
            </div>
            <span className="text-[9px] mt-2 font-bold uppercase tracking-wider text-center max-w-[40px]">
              {['Dept', 'Doctor', 'Slot', 'Review', 'Pay', 'Finish'][i - 1]}
            </span>
          </div>
          {i < 6 && <div className={`h-1 flex-grow mx-2 rounded-full ${step > i ? 'bg-sky-600' : 'bg-gray-100'}`} />}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="bg-gray-50 min-h-screen py-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {step < 6 && (
          <div className="text-center mb-10">
            <h1 className="text-3xl font-extrabold text-gray-900 mb-2">In-Clinic Appointment</h1>
            <p className="text-gray-500">Book your physical consultation at Bhaktivedanta Health Care Center.</p>
          </div>
        )}

        {step < 6 && <StepIndicator />}

        <div className="bg-white rounded-[2rem] shadow-xl shadow-gray-200/50 p-8 lg:p-12 min-h-[400px]">
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center">
                <span className="w-8 h-8 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center mr-3">
                  <Stethoscope size={18} />
                </span>
                Select Department
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {departments.map((dept) => (
                  <button
                    key={dept.id}
                    onClick={() => handleDeptSelect(dept)}
                    className="flex flex-col items-start p-6 rounded-2xl border-2 border-gray-100 hover:border-sky-500 hover:bg-sky-50 transition-all text-left group"
                  >
                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                      <Stethoscope size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-1">{dept.name}</h3>
                    <p className="text-sky-600 font-bold text-sm">Rs. {dept.baseFee}</p>
                    <p className="text-gray-400 text-xs mt-2 line-clamp-2">{dept.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button onClick={() => setStep(1)} className="flex items-center text-gray-500 hover:text-sky-600 font-bold mb-8">
                <ArrowLeft size={18} className="mr-2" /> Back to Departments
              </button>
              <h2 className="text-2xl font-bold text-gray-900 mb-8 flex items-center">
                <span className="w-8 h-8 bg-sky-100 text-sky-600 rounded-lg flex items-center justify-center mr-3">
                  <UserIcon size={18} />
                </span>
                Available Doctors in {selectedDept?.name}
              </h2>

              {filteredDoctors.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-2xl">
                  <p className="text-gray-600 font-semibold">No doctors found for this department.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {filteredDoctors.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => handleDocSelect(doc)}
                      className="flex items-center p-6 rounded-2xl border-2 border-gray-100 hover:border-sky-500 hover:bg-sky-50 transition-all text-left space-x-6"
                    >
                      <img src={`https://i.pravatar.cc/100?u=${doc.id}`} className="w-20 h-20 rounded-xl object-cover" />
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{doc.name}</h3>
                        <p className="text-sm text-gray-500 mb-1">{doc.specialty}</p>
                        <p className="text-xs text-sky-600 font-bold mb-2">Available: {doc.availableDays?.join(', ')}</p>
                        <p className="text-sky-600 font-bold">Rs. {doc.fee}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button onClick={() => setStep(2)} className="flex items-center text-gray-500 hover:text-sky-600 font-bold mb-8">
                <ArrowLeft size={18} className="mr-2" /> Back to Doctors
              </button>

              <div className="mb-10">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                  <CalendarIcon size={18} className="mr-2 text-sky-600" /> 1. Select Available Date
                </h3>
                <div className="flex overflow-x-auto space-x-4 pb-4 scrollbar-hide">
                  {availableDates.map((date) => (
                    <button
                      key={date.full}
                      onClick={() => {
                        setSelectedDate(date.full);
                        setSelectedSlot('');
                      }}
                      className={`flex flex-col items-center justify-center min-w-[100px] p-4 rounded-2xl border-2 transition-all ${
                        selectedDate === date.full
                          ? 'bg-sky-600 border-sky-600 text-white shadow-lg'
                          : 'bg-white border-gray-100 text-gray-600 hover:border-sky-200'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-widest">{date.day.slice(0, 3)}</span>
                      <span className="text-xl font-black">{date.display.split(' ')[0]}</span>
                      <span className="text-[10px] font-bold">{date.display.split(' ')[1]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {selectedDate && (
                <div className="mb-10">
                  <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
                    <Clock size={18} className="mr-2 text-sky-600" /> 2. Choose Time Slot
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {availableSlots.map((slot) => {
                      const isBooked = bookedSlots.includes(slot);
                      return (
                        <button
                          key={slot}
                          disabled={isBooked}
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-3 rounded-xl font-bold text-sm transition-all ${
                            isBooked
                              ? 'bg-gray-50 text-gray-300 cursor-not-allowed border-gray-50'
                              : selectedSlot === slot
                              ? 'bg-sky-600 text-white shadow-lg'
                              : 'bg-sky-50 text-sky-600 hover:bg-sky-100'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                disabled={!selectedDate || !selectedSlot}
                onClick={handleDateAndSlotConfirm}
                className="w-full py-5 bg-sky-600 text-white rounded-2xl font-extrabold text-lg hover:bg-sky-700 transition shadow-xl shadow-sky-200 disabled:opacity-50"
              >
                Confirm Slot <ArrowRight className="ml-2 inline" size={20} />
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <button onClick={() => setStep(3)} className="flex items-center text-gray-500 hover:text-sky-600 font-bold mb-8">
                <ArrowLeft size={18} className="mr-2" /> Change Date/Time
              </button>
              <h2 className="text-2xl font-bold text-gray-900 mb-8">Appointment Review & Payment</h2>
              <div className="max-w-md mx-auto">
                <div className="bg-sky-50 rounded-3xl p-8 border border-sky-100 mb-8">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Patient</span>
                      <span className="font-bold text-gray-900">{user?.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Specialist</span>
                      <span className="font-bold text-gray-900">{selectedDoc?.name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Date & Time</span>
                      <span className="font-bold text-gray-900">
                        {new Date(selectedDate).toLocaleDateString()}, {selectedSlot}
                      </span>
                    </div>

                    <hr className="border-sky-100 my-4" />

                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Consultation Fee</span>
                      <span className="font-medium text-gray-800">Rs. {selectedDoc?.fee}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 font-medium">Gateway Fee (2%)</span>
                      <span className="font-medium text-gray-800">Rs. {gatewayFee}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-sky-200 mt-2">
                      <span className="text-xl font-bold text-gray-900">Total Amount</span>
                      <span className="text-2xl font-extrabold text-sky-600">Rs. {totalAmount}</span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={handleConfirmAndPay}
                  disabled={isProcessing}
                  className="w-full py-5 bg-sky-600 text-white rounded-2xl font-extrabold text-lg hover:bg-sky-700 transition shadow-xl shadow-sky-200 disabled:opacity-50 flex justify-center items-center"
                >
                  {isProcessing ? <Loader2 className="animate-spin" /> : `Confirm & Pay Rs. ${totalAmount}`}
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center py-12 animate-in fade-in duration-700">
              <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
                <Loader2 size={40} className="animate-spin" />
              </div>
              <h2 className="text-3xl font-extrabold text-gray-900 mb-4">Connecting to Payment Gateway</h2>
              <p className="mt-4 font-medium text-gray-600">Please wait, you are being securely redirected to our payment partner.</p>
            </div>
          )}

          {step === 6 && (
            <div className="text-center py-8 animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
                <Check size={48} strokeWidth={3} />
              </div>
              <h2 className="text-4xl font-extrabold text-gray-900 mb-2">Slot Reserved!</h2>
              <p className="text-gray-500 mb-12">Your in-person consultation is successfully booked.</p>

              <div className="bg-gray-50 rounded-3xl p-8 max-w-lg mx-auto text-left mb-12 border border-dashed border-gray-300">
                <div className="flex items-center space-x-3 mb-6 p-4 bg-white rounded-2xl">
                  <MapPin className="text-sky-600" />
                  <div>
                    <p className="text-xs font-bold text-gray-400 uppercase">Clinic Address</p>
                    <p className="text-sm font-bold text-gray-900">108 Vedanta Lane, Peace Avenue, City-Center 400001</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-gray-500 font-medium">Patient Name:</div>
                  <div className="text-right font-bold">{user?.name}</div>
                  <div className="text-gray-500 font-medium">Doctor:</div>
                  <div className="text-right font-bold">{selectedDoc?.name}</div>
                  <div className="text-gray-500 font-medium">Date:</div>
                  <div className="text-right font-bold">{selectedDate}</div>
                  <div className="text-gray-500 font-medium">Time:</div>
                  <div className="text-right font-bold text-sky-600">{selectedSlot}</div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
                <button onClick={() => navigate('/dashboard')} className="px-8 py-4 bg-sky-600 text-white rounded-2xl font-bold hover:bg-sky-700 transition">
                  Go to Dashboard
                </button>
                <button onClick={() => window.print()} className="px-8 py-4 bg-white text-gray-700 border-2 border-gray-200 rounded-2xl font-bold hover:bg-gray-50 transition">
                  Download Slip
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BookAppointment;
