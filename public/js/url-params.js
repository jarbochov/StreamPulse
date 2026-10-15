// Case-insensitive overlay URL parameters: ?fontScale=1.2 and ?fontscale=1.2 are equivalent.
// Lowercase is the documented convention; camelCase names from older URLs keep working.
window.overlayParams = function overlayParams(search = window.location.search) {
    const values = new Map();
    new URLSearchParams(search).forEach((value, key) => {
        const name = key.toLowerCase();
        if (!values.has(name)) values.set(name, value);
    });
    return {
        get: name => (values.has(name.toLowerCase()) ? values.get(name.toLowerCase()) : null),
        has: name => values.has(name.toLowerCase())
    };
};
