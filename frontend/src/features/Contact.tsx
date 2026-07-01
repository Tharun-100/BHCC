
import React, { useState } from 'react';
import { MapPin, Phone, Mail, Clock, Send, Loader2, CheckCircle } from 'lucide-react';
import { CLINIC_ADDRESS, CLINIC_PHONE, CLINIC_EMAIL } from '../constants';
import { useAuth } from '@/providers/AuthProvider';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';

const Contact: React.FC = () => {
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    subject: 'General Inquiry',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.message) {
      setStatus('error');
      setFeedbackMessage('Please fill in all required fields.');
      return;
    }

    setStatus('sending');
    setFeedbackMessage('');

    try {
      const token = getAccessToken() || undefined;
      const result = await apiFetch<{ status: string; message?: string }>('/api/contact/', {
        method: 'POST',
        authToken: token,
        body: JSON.stringify(formData)
      });
      setStatus('success');
      setFeedbackMessage(result.message || 'Your message has been sent successfully!');
      setFormData(prev => ({ ...prev, message: '' })); // Clear message on success
    } catch (error: any) {
      setStatus('error');
      setFeedbackMessage(error.message || 'An error occurred. Please try again later.');
    }
  };

  return (
    <div className="bg-white min-h-screen py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mb-16">
          <h1 className="text-5xl font-extrabold text-gray-900 mb-6">Connect with Us</h1>
          <p className="text-xl text-gray-500 leading-relaxed">
            Have questions or need help booking a doctor consultation? Contact our team for assistance with appointments and available specialties.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Contact Details */}
          <div className="lg:col-span-5 space-y-12">
            <div className="min-h-80 bg-sky-50 rounded-[2.5rem] border-4 border-white p-10 flex flex-col justify-between">
              <div className="w-14 h-14 bg-sky-600 text-white rounded-2xl flex items-center justify-center">
                <MapPin size={28} />
              </div>
              <div className="space-y-4 mt-10">
                <div>
                  <p className="text-xs font-bold text-sky-600 uppercase tracking-widest mb-2">Visit the clinic</p>
                  <p className="text-lg font-bold text-gray-900 leading-relaxed">{CLINIC_ADDRESS}</p>
                </div>
                <p className="text-sm text-gray-500">Call us for directions before travelling.</p>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div className="lg:col-span-7">
            <div className="bg-gray-50 p-10 lg:p-12 rounded-[3rem] border border-gray-100">
              <h3 className="text-2xl font-bold text-gray-900 mb-8">Send us a Message</h3>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Full Name</label>
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="John Doe" className="w-full bg-white border-2 border-transparent rounded-2xl p-4 text-gray-900 focus:ring-0 focus:border-sky-500 transition shadow-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Email Address</label>
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange} placeholder="john@example.com" className="w-full bg-white border-2 border-transparent rounded-2xl p-4 text-gray-900 focus:ring-0 focus:border-sky-500 transition shadow-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Subject</label>
                  <select name="subject" value={formData.subject} onChange={handleInputChange} className="w-full bg-white border-2 border-transparent rounded-2xl p-4 text-gray-900 focus:ring-0 focus:border-sky-500 transition shadow-sm">
                    <option>General Inquiry</option>
                    <option>Billing Question</option>
                    <option>Appointment Issue</option>
                    <option>Feedback</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Message</label>
                  <textarea name="message" value={formData.message} onChange={handleInputChange} rows={5} placeholder="How can we help you?" className="w-full bg-white border-2 border-transparent rounded-2xl p-4 text-gray-900 focus:ring-0 focus:border-sky-500 transition shadow-sm"></textarea>
                </div>
                
                {feedbackMessage && (
                  <div className={`p-4 rounded-xl text-sm font-bold ${status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedbackMessage}
                  </div>
                )}

                <button type="submit" disabled={status === 'sending'} className="w-full py-5 bg-sky-600 text-white rounded-2xl font-black text-lg hover:bg-sky-700 transition shadow-xl shadow-sky-200 flex items-center justify-center disabled:opacity-70">
                  {status === 'sending' ? <><Loader2 size={24} className="animate-spin mr-3" /> Sending...</> : <><Send size={20} className="mr-3" /> Submit Message</>}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Contact;
