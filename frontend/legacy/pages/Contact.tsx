
import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { MapPin, Phone, Mail, Clock, Send, Loader2, CheckCircle } from 'lucide-react';
import { CLINIC_ADDRESS, CLINIC_PHONE, CLINIC_EMAIL } from '../constants';
import { User } from '../types';

interface ContactProps {
  user: User | null;
}

const Contact: React.FC<ContactProps> = ({ user }) => {

  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    subject: 'General Inquiry',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [feedbackMessage, setFeedbackMessage] = useState('');

  const functions = getFunctions();

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

    if (!user) {
        setStatus('error');
        setFeedbackMessage('You must be logged in to send a message.');
        return;
    }

    setStatus('sending');
    setFeedbackMessage('');

    try {
      const sendContactMessage = httpsCallable(functions, 'sendContactMessage');
      const result: any = await sendContactMessage(formData);

      setStatus('success');
      setFeedbackMessage(result.data.message || 'Your message has been sent successfully!');
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
            Have questions or need assistance? Our dedicated support team is available 24/7 to help you with your healthcare needs.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
          {/* Contact Details & Map */}
          <div className="lg:col-span-5 space-y-12">
            {/* Contact Info Grid... */}
            <div className="h-80 bg-gray-100 rounded-[2.5rem] border-4 border-gray-50 overflow-hidden">
                <iframe 
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3770.718873550579!2d72.8833501148564!3d19.07609008708761!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3be7c6306644edc1%3A0x5da4ed8f8d648c69!2sMumbai%2C%20Maharashtra%2C%20India!5e0!3m2!1sen!2sus!4v1678886438515!5m2!1sen!2sus"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Clinic Location"
                ></iframe>
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
