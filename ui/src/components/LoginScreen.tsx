import React, { useState } from 'react';
import { signInWithPopup, signInWithRedirect, GoogleAuthProvider } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { auth, googleProvider } from '../firebase';
import { Brain, LogIn, AlertCircle } from 'lucide-react';

export const LoginScreen: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Capacitor.isNativePlatform()) {
        await signInWithRedirect(auth, googleProvider);
      } else {
        await signInWithPopup(auth, googleProvider);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center">
        <div className="bg-indigo-500/20 p-4 rounded-2xl mb-6">
          <Brain className="w-12 h-12 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 text-center">AI Trading Terminal</h1>
        <p className="text-slate-400 text-center mb-8">Sign in to sync your ML strategies, risk config, and trading history.</p>
        
        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-400 p-3 rounded-xl mb-6 flex items-start gap-3 w-full">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-white hover:bg-slate-100 text-slate-900 font-bold py-3 px-4 rounded-xl flex items-center justify-center gap-3 transition-colors"
        >
          {loading ? (
             <div className="w-5 h-5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
          ) : (
             <LogIn className="w-5 h-5" />
          )}
          <span>Sign In with Google</span>
        </button>
      </div>
    </div>
  );
};
