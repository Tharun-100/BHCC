
import React, { useEffect, useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

const PaymentCallbackPage: React.FC = () => {
  const location = useLocation();
  const { orderId, paymentSuccess, gatewayResponse } = location.state || {};

  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!orderId) {
      setStatus('error');
      setErrorMessage('No order ID found. Your session may have expired.');
      return;
    }

    const verify = async () => {
      const functions = getFunctions();
      const verifyPayment = httpsCallable(functions, 'verifyPayment');

      try {
        await verifyPayment({ 
          orderId,
          paymentSuccess,
          gatewayResponse 
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
  }, [orderId, paymentSuccess, gatewayResponse]);

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
              to="/dashboard"
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
              to="/book"
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
