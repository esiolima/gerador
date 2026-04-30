import { useLocation } from "wouter";
import { useEffect } from "react";

export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to card generator
    setLocation("/generator");
  }, [setLocation]);

  return null;
}
