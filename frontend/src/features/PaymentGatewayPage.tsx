import React, { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';

type GatewayResponse = {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
  error?: unknown;
};

const loadRazorpayCheckout = (): Promise<boolean> =>
  new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

const PaymentGatewayPage: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasLaunchedCheckout = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const orderId = searchParams?.get('orderId') || '';
  const gatewayOrderId = searchParams?.get('gatewayOrderId') || '';
  const amount = Number(searchParams?.get('amount') || '0');
  const amountPaise = Number(searchParams?.get('amountPaise') || '0');
  const currency = searchParams?.get('currency') || 'INR';
  const doctorName = searchParams?.get('doctorName') || '';
  const appointmentDate = searchParams?.get('appointmentDate') || '';

  if (!orderId || !gatewayOrderId || !amount || !amountPaise) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600">Invalid Payment Request</h2>
          <p className="text-gray-600">No order details were found. Please try booking again.</p>
          <button onClick={() => router.push('/book')} className="mt-4 px-6 py-2 bg-sky-600 text-white rounded-lg">
            Return to Booking
          </button>
        </div>
      </div>
    );
  }

  const handlePaymentResponse = (paymentSuccess: boolean, gatewayResponse: GatewayResponse) => {
    const qs = new URLSearchParams({
      orderId,
      success: paymentSuccess ? '1' : '0',
    });

    if (paymentSuccess) {
      if (gatewayResponse.razorpay_payment_id) qs.set('razorpay_payment_id', gatewayResponse.razorpay_payment_id);
      if (gatewayResponse.razorpay_order_id) qs.set('razorpay_order_id', gatewayResponse.razorpay_order_id);
      if (gatewayResponse.razorpay_signature) qs.set('razorpay_signature', gatewayResponse.razorpay_signature);
    } else {
      qs.set('error', typeof gatewayResponse.error === 'string' ? gatewayResponse.error : 'Payment failed or cancelled.');
    }

    router.replace(`/payment-callback?${qs.toString()}`);
  };

  useEffect(() => {
    const startCheckout = async () => {
      if (hasLaunchedCheckout.current) return;
      hasLaunchedCheckout.current = true;

      const razorpayKeyId = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
      if (!razorpayKeyId) {
        setError('Razorpay public key is missing. Set NEXT_PUBLIC_RAZORPAY_KEY_ID.');
        return;
      }

      const loaded = await loadRazorpayCheckout();
      if (!loaded || !window.Razorpay) {
        setError('Could not load Razorpay checkout. Please try again.');
        return;
      }

      const options = {
        key: razorpayKeyId,
        amount: amountPaise,
        currency: currency || 'INR',
        name: 'Bhaktivedanta Health Care Center',
        description: `Consultation with ${doctorName || 'Doctor'}`,
        order_id: gatewayOrderId,
        handler: (response: GatewayResponse) => {
          handlePaymentResponse(true, response);
        },
        modal: {
          ondismiss: () => {
            handlePaymentResponse(false, { error: 'Checkout closed by user.' });
          },
        },
        notes: {
          appOrderId: orderId,
        },
        theme: {
          color: '#0284c7',
        },
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', (resp: any) => {
        handlePaymentResponse(false, { error: resp?.error || 'Payment failed.' });
      });
      razorpay.open();
    };

    startCheckout().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to start Razorpay checkout.');
    });
  }, [amountPaise, currency, doctorName, gatewayOrderId, orderId, router]);

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-lg">
        <div className="p-8 border-b">
          <h1 className="text-2xl font-extrabold text-gray-800">Razorpay Checkout</h1>
          <p className="text-sm text-gray-500">Please complete payment in the secure Razorpay window.</p>
        </div>
        <div className="p-8">
          <div className="text-center mb-8">
            <p className="text-gray-600">You are paying</p>
            <p className="text-5xl font-extrabold text-sky-600">Rs. {amount}</p>
            <p className="text-gray-600 mt-2">for an appointment with</p>
            <p className="font-bold text-gray-900">
              {doctorName} on {new Date(appointmentDate).toLocaleDateString()}
            </p>
          </div>

          {!error ? (
            <div className="flex flex-col items-center py-6">
              <Loader2 className="w-10 h-10 text-sky-600 animate-spin mb-4" />
              <p className="text-center font-semibold text-gray-700">Launching Razorpay checkout...</p>
              <p className="text-xs text-gray-500 mt-2">If popup is blocked, allow popups for this site and retry.</p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-center">
              <AlertTriangle className="mx-auto text-red-600 mb-2" />
              <p className="text-sm font-semibold text-red-700">{error}</p>
              <button onClick={() => router.push('/book')} className="mt-4 px-5 py-2 bg-sky-600 text-white rounded-lg font-semibold">
                Back to Booking
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentGatewayPage;
