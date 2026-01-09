/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { loadLiteratureMapFromPath } from '../lib/map';
import type { LiteratureMap } from '../lib/types';
import { basename } from '../lib/path';

interface MapContextType {
    currentMap: LiteratureMap | null;
    mapPath: string | null;
    mapFileName: string | null;
    loadMap: (path: string) => Promise<void>;
    clearMap: () => void;
}

const MapContext = createContext<MapContextType | undefined>(undefined);

export const MapProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [currentMap, setCurrentMap] = useState<LiteratureMap | null>(null);
    const [mapPath, setMapPath] = useState<string | null>(null);
    const [mapFileName, setMapFileName] = useState<string | null>(null);

    const loadMap = async (path: string) => {
        try {
            const map = await loadLiteratureMapFromPath(path);
            setCurrentMap(map);
            setMapPath(path);
            setMapFileName(basename(path));
            console.log('Map loaded successfully:', { path, size: map.size });
        } catch (error) {
            console.error('Failed to load map:', error);
            throw error;
        }
    };

    const clearMap = () => {
        setCurrentMap(null);
        setMapPath(null);
        setMapFileName(null);
    };

    return (
        <MapContext.Provider value={{ currentMap, mapPath, mapFileName, loadMap, clearMap }}>
            {children}
        </MapContext.Provider>
    );
};

export const useMap = () => {
    const context = useContext(MapContext);
    if (context === undefined) {
        throw new Error('useMap must be used within a MapProvider');
    }
    return context;
};
