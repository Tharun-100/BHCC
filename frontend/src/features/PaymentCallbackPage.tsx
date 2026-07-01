
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { getAccessToken } from '@/lib/storage';

const PaymentCallbackPage: React.FC = () => {
  const searchParams = useSearchParams();
  const orderId = searchParams?.get('orderId') || '';
  const paymentSuccess = searchParams?.get('success') === '1';
  const gatewayResponse = {
    razorpay_payment_id: searchParams?.get('razorpay_payment_id') || undefined,
    razorpay_order_id: searchParams?.get('razorpay_order_id') || undefined,
    razorpay_signature: searchParams?.get('razorpay_signature') || undefined,
    error: searchParams?.get('error') || undefined
  };

  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      setErrorMessage('No order ID found. Your session may have expired.');
      return;
    }

    const verify = async () => {
      try {
        const token = getAccessToken();
        if (!token) throw new Error('You are signed out. Please sign in and retry.');

        await apiFetch<{ status: string; message?: string }>('/api/payments/verify/', {
          method: 'POST',
          authToken: token,
          body: JSON.stringify({
          orderId,
          paymentSuccess,
          gatewayResponse 
          })
        });
        
        if (paymentSuccess) {
          setStatus('success');
        } else {
          setStatus('error');
          setErrorMessage('The payment was not successful. Please try booking again.');
        }

      } catch (error: any) {
        setStatus('error');
        // Use the error message from the cloud function if available
        setErrorMessage(error.message || 'An unknown error occurred during payment verification.');
      }
    };

    verify();
  }, [orderId, paymentSuccess, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-lg text-center">
        {status === 'processing' && (
          <div className="animate-in fade-in duration-500">
            <Loader2 className="w-16 h-16 text-sky-500 mx-auto animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-gray-800">Verifying Payment...</h2>
            <p className="text-gray-600 mt-2">Please wait, we are confirming your transaction.</p>
          </div>
        )}

        {status === 'success' && (
          <div className="animate-in zoom-in duration-500">
            <CheckCircle2 className="w-20 h-20 text-green-500 mx-auto mb-6" />
            <h2 className="text-3xl font-extrabold text-gray-900">Booking Confirmed!</h2>
            <p className="text-gray-600 mt-2 mb-8">Your appointment has been successfully scheduled. You will receive a confirmation email shortly.</p>
            <Link 
              href="/dashboard"
              className="px-8 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition"
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="animate-in zoom-in duration-500">
            <AlertTriangle className="w-20 h-20 text-red-500 mx-auto mb-6" />
            <h2 className="text-3xl font-extrabold text-gray-900">Payment Failed</h2>
            <p className="text-gray-600 mt-2 mb-8">{errorMessage}</p>
            <Link 
              href="/book"
              className="px-8 py-3 bg-sky-600 text-white rounded-xl font-bold hover:bg-sky-700 transition"
            >
              Try Again
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentCallbackPage;
