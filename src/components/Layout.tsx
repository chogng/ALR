import React from 'react';
import { TopBar } from './TopBar';
import { MainContent } from './MainContent';
import { StatusBar } from './StatusBar';
import { MapProvider } from '../contexts/MapContext';
import { FileProvider } from '../contexts/FileContext';
import './Layout.css';

export const Layout: React.FC = () => {
    return (
        <MapProvider>
            <FileProvider>
                <div className="app-layout">
                    <TopBar />
                    <div className="app-body">
                        <MainContent />
                    </div>
                    <StatusBar />
                </div>
            </FileProvider>
        </MapProvider>
    );
};
