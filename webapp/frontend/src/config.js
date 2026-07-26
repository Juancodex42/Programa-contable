const config = {
    API_URL: import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:5000`
};

export default config;
