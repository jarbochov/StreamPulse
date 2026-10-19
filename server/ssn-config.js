function normalizeSsnSessionId(value) {
    if (typeof value !== 'string') return '';
    const id = value.trim();
    return /^[\w-]{1,100}$/.test(id) && !/^YOUR_SSN_SESSION_ID$/i.test(id) ? id : '';
}

module.exports = { normalizeSsnSessionId };
