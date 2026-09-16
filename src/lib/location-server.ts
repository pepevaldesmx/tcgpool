import { cookies } from "next/headers";
import { LOCATION_COOKIE, parseLocation, type UserLocation } from "@/lib/location";

/** Ubicación del usuario leída de la cookie, del lado del servidor. */
export async function getUserLocation(): Promise<UserLocation | null> {
  const store = await cookies();
  return parseLocation(store.get(LOCATION_COOKIE)?.value);
}
