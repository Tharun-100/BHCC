
import React, { useState } from 'react';
import { Star, Send, LogIn, CheckCircle2 } from 'lucide-react';
import { User, UserRole } from '../types';
import { Link, useLocation } from 'react-router-dom';
import { listApprovedFeedback, submitFeedback } from '../services/clinicService';

interface FeedbackPageProps {
  user: User | null;
}

const FeedbackPage: React.FC<FeedbackPageProps> = ({ user }) => {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackList, setFeedbackList] = useState<Array<{ id: string; name: string; rating: number; comment: string; date: string }>>([]);
  const location = useLocation();

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const list = await listApprovedFeedback();
      if (!mounted) return;
      setFeedbackList(
        list.map((f) => ({
          id: f.id,
          name: f.patientName,
          rating: f.rating,
          comment: f.comment,
          date: f.date,
        }))
      );
    };

    load().catch(() => {
      // Keep page functional even if feedback fetch fails.
      setFeedbackList([]);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || user.role !== UserRole.PATIENT) return;
    
    setIsSubmitting(true);
    try {
      await submitFeedback({
        patientId: user.id,
        patientName: user.name,
        patientEmail: user.email,
        rating,
        comment: comment.trim(),
      });
      setIsSubmitting(false);
      setIsSubmitted(true);
      setComment('');
    } catch {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="lg:grid lg:grid-cols-2 lg:gap-16">
        {/* Left: Feedback List */}
        <div>
          <h2 className="text-4xl font-black text-gray-900 mb-2">Patient Community</h2>
          <p className="text-gray-500 mb-10 text-lg">See why thousands of families trust Bhaktivedanta for their health.</p>
          
          <div className="space-y-6">
            {feedbackList.map(f => (
              <div key={f.id} className="bg-white p-8 rounded-[2rem] border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-full flex items-center justify-center font-bold">
                      {f.name[0]}
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">{f.name}</h4>
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">{f.date}</p>
                    </div>
                  </div>
                  <div className="flex space-x-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} size={14} fill={i <= f.rating ? "#f59e0b" : "transparent"} className={i <= f.rating ? "text-amber-500" : "text-gray-100"} />
                    ))}
                  </div>
                </div>
                <p className="text-gray-600 leading-relaxed italic">"{f.comment}"</p>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Submission Section */}
        <div className="mt-16 lg:mt-0">
          <div className="sticky top-32">
            {!user ? (
              <div className="bg-white p-10 lg:p-12 rounded-[2.5rem] border border-gray-100 shadow-xl text-center">
                <div className="w-20 h-20 bg-sky-50 text-sky-600 rounded-3xl flex items-center justify-center mx-auto mb-8">
                  <Star size={40} />
                </div>
                <h3 className="text-2xl font-black text-gray-900 mb-4">Share Your Experience</h3>
                <p className="text-gray-500 mb-10 leading-relaxed">
                  Only verified patients can leave feedback. Please log in to your account to share your journey with us.
                </p>
                <Link 
                  to="/login" 
                  state={{ from: location.pathname, preferredRole: UserRole.PATIENT }}
                  className="inline-flex items-center px-8 py-4 bg-sky-600 text-white rounded-2xl font-bold text-lg hover:bg-sky-700 transition shadow-xl shadow-sky-100"
                >
                  Login as Patient <LogIn size={20} className="ml-3" />
                </Link>
              </div>
            ) : user.role !== UserRole.PATIENT ? (
              <div className="bg-amber-50 p-10 rounded-[2.5rem] border border-amber-100 text-center">
                <h3 className="text-xl font-bold text-amber-900 mb-2">Patient Feedback Portal</h3>
                <p className="text-amber-700 text-sm">
                  You are currently logged in as a <strong>{user.role}</strong>. Only patients are eligible to provide feedback on consultations.
                </p>
              </div>
            ) : isSubmitted ? (
              <div className="bg-green-50 p-12 rounded-[2.5rem] border border-green-100 text-center animate-in zoom-in duration-500">
                <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-8">
                  <CheckCircle2 size={48} />
                </div>
                <h3 className="text-3xl font-black text-gray-900 mb-4">Thank You, {user.name}!</h3>
                <p className="text-gray-600 mb-8 leading-relaxed">
                  Your feedback has been successfully submitted and will be visible after review.
                </p>
                <button 
                  onClick={() => setIsSubmitted(false)}
                  className="text-sky-600 font-bold hover:underline"
                >
                  Write another review
                </button>
              </div>
            ) : (
              <div className="bg-sky-600 p-10 lg:p-12 rounded-[2.5rem] shadow-2xl shadow-sky-200 text-white overflow-hidden relative">
                {/* Decorative circle */}
                <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl"></div>
                
                <div className="relative z-10">
                  <h3 className="text-3xl font-black mb-2">Welcome, {user.name}</h3>
                  <p className="text-sky-100 mb-10 font-medium">Your feedback makes our care better for everyone.</p>
                  
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-sky-100 mb-3">Overall Rating</label>
                      <div className="flex space-x-3">
                        {[1, 2, 3, 4, 5].map(i => (
                          <button 
                            key={i} 
                            type="button" 
                            onClick={() => setRating(i)}
                            className="transition-all hover:scale-125 focus:outline-none"
                          >
                            <Star size={36} fill={i <= rating ? "#fff" : "transparent"} className={i <= rating ? "text-white" : "text-sky-400"} />
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-widest text-sky-100 mb-3">Your Message</label>
                      <textarea 
                        required
                        rows={5}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Describe your visit at Bhaktivedanta..."
                        className="w-full bg-sky-500/50 text-white placeholder-sky-200 border-2 border-sky-400 rounded-3xl p-6 focus:ring-0 focus:border-white transition-all text-lg"
                      />
                    </div>

                    <div className="flex items-center space-x-2 text-xs text-sky-100 font-bold uppercase tracking-widest mb-6 px-1">
                      <span>Posting as:</span>
                      <span className="text-white bg-sky-700/50 px-2 py-1 rounded">{user.name}</span>
                      <span>Date:</span>
                      <span className="text-white bg-sky-700/50 px-2 py-1 rounded">{new Date().toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>

                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full py-5 bg-white text-sky-600 rounded-2xl font-black text-xl hover:bg-sky-50 transition shadow-xl flex items-center justify-center disabled:opacity-50"
                    >
                      {isSubmitting ? 'Sending...' : 'Post Feedback'} <Send size={22} className="ml-3" />
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FeedbackPage;
