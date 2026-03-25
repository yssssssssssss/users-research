const AUTHENTICITY_DOWNGRADE_PREFIX = '已对综合判断应用真实性降级：';
export const splitTaskWarnings = (warnings) => {
    const groups = {
        authenticityDowngrade: [],
        otherWarnings: [],
    };
    for (const warning of warnings || []) {
        if (typeof warning !== 'string' || !warning.trim())
            continue;
        if (warning.startsWith(AUTHENTICITY_DOWNGRADE_PREFIX)) {
            groups.authenticityDowngrade.push(warning);
            continue;
        }
        groups.otherWarnings.push(warning);
    }
    return groups;
};
