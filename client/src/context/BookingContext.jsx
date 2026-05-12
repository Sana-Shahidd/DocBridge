import { createContext, useContext, useState } from 'react';

const BookingContext = createContext(null);

export function BookingProvider({ children }) {
  const [bookingDoctor, setBookingDoctor] = useState(null); // null = wizard closed

  function openBooking(doctor) {
    setBookingDoctor(doctor);
  }

  function closeBooking() {
    setBookingDoctor(null);
  }

  return (
    <BookingContext.Provider value={{ bookingDoctor, openBooking, closeBooking }}>
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error('useBooking must be used inside <BookingProvider>');
  return ctx;
}
