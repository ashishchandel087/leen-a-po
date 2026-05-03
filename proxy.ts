import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*", "/about/:path*", "/about", "/pissoff/:path*", "/pissoff", "/mars/:path*", "/mars", "/neptune/:path*", "/neptune"],
};
