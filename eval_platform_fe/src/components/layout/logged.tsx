import { Outlet } from 'react-router-dom';
import { Navbar } from '../navbar';

export function Logged() {

    return (
        <div className="min-h-screen bg-background font-sans antialiased">
            <Navbar/>
            <main className="min-w-0 flex-1">
                <div className="mx-auto max-w-6xl px-6 py-6">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
