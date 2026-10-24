import React from 'react';
import { useNavigate } from 'react-router-dom';
import TranslationPage from './TranslationPage';

const TranslationRoute: React.FC = () => {
  const navigate = useNavigate();
  return (
    <TranslationPage
      onOpenTracker={() => navigate('/translation/tracker')}
      onBack={() => navigate('/')}
    />
  );
};

export default TranslationRoute;
