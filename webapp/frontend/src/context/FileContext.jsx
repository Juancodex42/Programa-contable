import { createContext, useState, useContext } from 'react';

const FileContext = createContext();

// eslint-disable-next-line react-refresh/only-export-components
export const useFileContext = () => useContext(FileContext);

export const FileProvider = ({ children }) => {
    const [fileList, setFileList] = useState([]);
    const [processing, setProcessing] = useState(false);
    const [results, setResults] = useState(null);
    const [error, setError] = useState(null);

    const addFiles = (newFiles) => {
        setFileList(prev => [...prev, ...newFiles]);
    };

    const clearFiles = () => {
        setFileList([]);
        setResults(null);
        setError(null);
    };

    return (
        <FileContext.Provider value={{
            fileList,
            addFiles,
            clearFiles,
            processing,
            setProcessing,
            results,
            setResults,
            error,
            setError
        }}>
            {children}
        </FileContext.Provider>
    );
};
