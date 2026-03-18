import React, { useState } from 'react';
import { getHPStatus } from '../utils/healthSystem';

const getAbilityModifier = (score) => Math.floor(((score || 10) - 10) / 2);

const RESIDENTIAL_TYPES = ['house', 'manor', 'keep'];
const REST_BUILDING_TYPES = ['inn', 'tavern'];

const familyRoleLabel = (npc) => {
    if (npc.familyRole === 'head') return 'Head of Household';
    if (npc.familyRole === 'spouse') return 'Spouse';
    if (npc.familyRole === 'child') return 'Child';
    return null;
};

const genderIcon = (gender) => {
    if (gender === 'Male') return '\u2642';
    if (gender === 'Female') return '\u2640';
    return '';
};

const BuildingModal = ({ building, npcs, onClose, firstHero, onQuestItemFound, onRest, party }) => {
    const [imageError, setImageError] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [searchAttempts, setSearchAttempts] = useState(0);
    const [searchResult, setSearchResult] = useState(null); // { success, roll, modifier, dc, total }
    const [itemFound, setItemFound] = useState(false);
    const [restResult, setRestResult] = useState(null); // { restType, healingResults: [{ name, before, after, maxHP }] }
    const [showAllNpcs, setShowAllNpcs] = useState(false);

    if (!building) return null;

    const isResidential = RESIDENTIAL_TYPES.includes(building.buildingType);
    const canRest = REST_BUILDING_TYPES.includes(building.buildingType);
    const restType = building.buildingType === 'inn' ? 'long' : 'short';
    const partyNeedsHealing = party && party.some(h => h.currentHP < h.maxHP && !h.isDefeated);

    // Map building types to image names
    const getImageSrc = (type, bld) => {
        if (type === 'house') {
            const variant = ((bld.x || 0) + (bld.y || 0)) % 3 + 1;
            return `/assets/buildings/house_interior_${variant}.webp`;
        }
        if (type === 'manor') {
            return `/assets/buildings/manor_interior_1.webp`;
        }
        const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
        return `/assets/buildings/${normalizedType}.webp`;
    };

    const imageSrc = getImageSrc(building.buildingType, building);

    const toggleLightbox = (e) => {
        if (e) e.stopPropagation();
        setIsLightboxOpen(!isLightboxOpen);
    };

    // Sort residential NPCs: head first, then spouse, then children
    const sortedNpcs = isResidential
        ? [...npcs].sort((a, b) => {
            const order = { head: 0, spouse: 1, child: 2 };
            return (order[a.familyRole] ?? 3) - (order[b.familyRole] ?? 3);
        })
        : npcs;

    // Deduplicate NPCs who both work and live here (same NPC matched by both location and homeCoords)
    const uniqueNpcs = [];
    const seenIds = new Set();
    for (const npc of sortedNpcs) {
        if (!seenIds.has(npc.id)) {
            seenIds.add(npc.id);
            uniqueNpcs.push(npc);
        }
    }

    return (
        <>
            <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.7)' }}>
                <div
                    className="modal-content building-modal"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        maxWidth: '780px',
                        width: '95%',
                        border: '3px solid var(--primary)',
                        padding: '0',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: 'var(--surface)',
                        color: 'var(--text)',
                        boxShadow: '0 15px 40px var(--shadow)',
                        borderRadius: '12px'
                    }}
                >
                    {/* Header Section - Above the image */}
                    <div style={{ padding: '25px 25px 15px 25px', textAlign: 'center' }}>
                        <h2 style={{
                            color: 'var(--primary)',
                            margin: '0 0 8px 0',
                            fontSize: '2.2rem',
                            letterSpacing: '2px',
                            textTransform: 'uppercase',
                            fontFamily: 'var(--header-font)'
                        }}>
                            {building.buildingName || building.buildingType.charAt(0).toUpperCase() + building.buildingType.slice(1)}
                        </h2>
                        <div style={{
                            fontSize: '14px',
                            color: 'var(--text-secondary)',
                            fontStyle: 'italic',
                            fontFamily: 'var(--body-font)'
                        }}>
                            {building.buildingType} | Location: ({building.x}, {building.y})
                        </div>
                    </div>

                    {/* Image Section - real image or placeholder for houses */}
                    {!imageError ? (
                        <div
                            style={{
                                width: 'calc(100% - 50px)',
                                height: '365px',
                                margin: '0 25px 20px 25px',
                                backgroundColor: '#000',
                                position: 'relative',
                                overflow: 'hidden',
                                borderRadius: '10px',
                                border: isHovered ? '3px solid var(--primary)' : '3px solid var(--border)',
                                cursor: 'pointer',
                                transition: 'all 0.3s ease',
                                transform: isHovered ? 'scale(1.005)' : 'scale(1)',
                                boxShadow: isHovered ? '0 0 20px var(--primary)' : 'none'
                            }}
                            onMouseEnter={() => setIsHovered(true)}
                            onMouseLeave={() => setIsHovered(false)}
                            onClick={toggleLightbox}
                            title="Click to view larger image"
                        >
                            <img
                                src={imageSrc}
                                alt={building.buildingType}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    opacity: isHovered ? 0.85 : 1,
                                    transition: 'opacity 0.3s ease'
                                }}
                                onError={() => setImageError(true)}
                            />
                            {isHovered && (
                                <div style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: 'translate(-50%, -50%)',
                                    color: 'var(--bg)',
                                    backgroundColor: 'var(--primary)',
                                    padding: '10px 20px',
                                    borderRadius: '25px',
                                    fontSize: '0.9rem',
                                    fontWeight: 'bold',
                                    pointerEvents: 'none',
                                    border: '1px solid var(--bg)',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                                }}>
                                    View Full Size
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Placeholder when no image exists */
                        <div style={{
                            width: 'calc(100% - 50px)',
                            height: '160px',
                            margin: '0 25px 20px 25px',
                            background: 'linear-gradient(135deg, rgba(139,90,43,0.15) 0%, rgba(101,67,33,0.25) 100%)',
                            borderRadius: '10px',
                            border: '3px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                        }}>
                            <span style={{ fontSize: '3.5rem' }}>
                                {building.buildingType === 'house' ? '\uD83C\uDFE0' :
                                 building.buildingType === 'manor' ? '\uD83C\uDFF0' :
                                 building.buildingType === 'keep' ? '\uD83C\uDFF0' : '\uD83C\uDFE2'}
                            </span>
                            <span style={{
                                fontSize: '0.85rem',
                                color: 'var(--text-secondary)',
                                fontStyle: 'italic',
                                fontFamily: 'var(--body-font)'
                            }}>
                                {isResidential ? 'A humble dwelling in town' : building.buildingType}
                            </span>
                        </div>
                    )}

                    <div style={{ padding: '0 25px 25px 25px' }}>
                        {/* Inhabitants Section - enhanced for residential buildings */}
                        <div className="modal-section" style={{
                            backgroundColor: 'rgba(0,0,0,0.03)',
                            padding: '20px',
                            borderRadius: '10px',
                            border: '1px solid var(--border)'
                        }}>
                            <h4 style={{
                                borderBottom: '2px solid var(--primary)',
                                paddingBottom: '10px',
                                margin: '0 0 15px 0',
                                color: 'var(--primary)',
                                fontFamily: 'var(--header-font)'
                            }}>
                                {isResidential ? 'Household' : 'Inhabitants & Workers'}
                            </h4>
                            {uniqueNpcs.length > 0 ? (
                                <>
                                <ul style={{ listStyle: 'none', padding: 0, margin: '0' }}>
                                    {(showAllNpcs ? uniqueNpcs : uniqueNpcs.slice(0, 4)).map(npc => {
                                        const roleLabel = isResidential ? familyRoleLabel(npc) : null;
                                        const isWorksElsewhere = isResidential &&
                                            npc.location && npc.location.homeCoords &&
                                            (npc.location.x !== npc.location.homeCoords.x || npc.location.y !== npc.location.homeCoords.y);

                                        return (
                                            <li key={npc.id} style={{
                                                padding: '10px 0',
                                                borderBottom: '1px dashed var(--border)',
                                            }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}>
                                                    <span style={{ fontWeight: 'bold', color: 'var(--text)' }}>
                                                        {genderIcon(npc.gender)} {npc.name}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '12px',
                                                        color: 'var(--text-secondary)',
                                                        backgroundColor: 'var(--border)',
                                                        padding: '4px 12px',
                                                        borderRadius: '6px',
                                                        fontWeight: '500'
                                                    }}>
                                                        {npc.job || npc.title || 'Resident'}
                                                    </span>
                                                </div>
                                                {/* Extra details for residential buildings */}
                                                {isResidential && (
                                                    <div style={{
                                                        display: 'flex',
                                                        gap: '12px',
                                                        marginTop: '4px',
                                                        fontSize: '0.8rem',
                                                        color: 'var(--text-secondary)',
                                                        fontFamily: 'var(--body-font)'
                                                    }}>
                                                        {roleLabel && <span>{roleLabel}</span>}
                                                        {npc.age && <span>Age {npc.age}</span>}
                                                        {npc.race && <span>{npc.race}</span>}
                                                        {isWorksElsewhere && (
                                                            <span style={{ fontStyle: 'italic' }}>
                                                                (works elsewhere)
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                                {uniqueNpcs.length > 4 && (
                                    <button
                                        onClick={() => setShowAllNpcs(!showAllNpcs)}
                                        style={{
                                            display: 'block',
                                            width: '100%',
                                            marginTop: '8px',
                                            padding: '6px',
                                            background: 'none',
                                            border: '1px dashed var(--border)',
                                            borderRadius: '6px',
                                            color: 'var(--primary)',
                                            cursor: 'pointer',
                                            fontSize: '0.85rem',
                                            fontFamily: 'var(--body-font)'
                                        }}
                                    >
                                        {showAllNpcs
                                            ? 'Show less'
                                            : `Show all (${uniqueNpcs.length - 4} more)`}
                                    </button>
                                )}
                                </>
                            ) : (
                                <p style={{
                                    fontStyle: 'italic',
                                    color: 'var(--text-secondary)',
                                    textAlign: 'center',
                                    margin: '20px 0',
                                    fontFamily: 'var(--body-font)'
                                }}>
                                    No one seems to be here right now.
                                </p>
                            )}
                        </div>

                        {/* Quest Item Search Section */}
                        {building.questItemId && !itemFound && (
                            <div className="modal-section" style={{
                                backgroundColor: 'rgba(0,0,0,0.03)',
                                padding: '20px',
                                borderRadius: '10px',
                                border: '2px solid var(--accent, var(--primary))',
                                marginTop: '15px'
                            }}>
                                <h4 style={{
                                    borderBottom: '2px solid var(--accent, var(--primary))',
                                    paddingBottom: '10px',
                                    margin: '0 0 15px 0',
                                    color: 'var(--accent, var(--primary))',
                                    fontFamily: 'var(--header-font)'
                                }}>
                                    Search for {building.questItemName || 'Quest Item'}
                                </h4>
                                <p style={{ margin: '0 0 15px 0', color: 'var(--text-secondary)', fontFamily: 'var(--body-font)' }}>
                                    {searchAttempts === 0
                                        ? 'You sense something important may be hidden here. Search the building to find it.'
                                        : `You've searched ${searchAttempts} time${searchAttempts > 1 ? 's' : ''}. Keep looking...`}
                                </p>
                                {searchResult && !searchResult.success && (
                                    <div style={{
                                        padding: '12px',
                                        marginBottom: '15px',
                                        borderRadius: '8px',
                                        backgroundColor: 'rgba(200, 100, 50, 0.1)',
                                        border: '1px solid rgba(200, 100, 50, 0.3)',
                                        fontFamily: 'var(--body-font)',
                                        fontSize: '0.9rem'
                                    }}>
                                        <strong>Roll: {searchResult.roll} + {searchResult.modifier} = {searchResult.total}</strong> (needed {searchResult.dc})
                                        <br />
                                        <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                                            {searchResult.total <= searchResult.dc - 5
                                                ? 'You rummage through shelves and drawers but find nothing of note. Perhaps try a different area.'
                                                : 'You notice something promising but can\'t quite locate it. You\'re getting closer...'}
                                        </span>
                                    </div>
                                )}
                                <button
                                    className="primary-button"
                                    onClick={() => {
                                        const baseDC = 12;
                                        const dcReduction = searchAttempts * 3;
                                        const dc = Math.max(2, baseDC - dcReduction);
                                        const stats = firstHero?.stats || {};
                                        const intMod = getAbilityModifier(stats.Intelligence || stats.intelligence);
                                        const wisMod = getAbilityModifier(stats.Wisdom || stats.wisdom);
                                        const modifier = Math.max(intMod, wisMod);
                                        const roll = Math.floor(Math.random() * 20) + 1;
                                        const total = roll + modifier;
                                        const success = total >= dc;
                                        const newAttempts = searchAttempts + 1;
                                        setSearchAttempts(newAttempts);
                                        setSearchResult({ success, roll, modifier, dc, total });
                                        if (success) {
                                            setItemFound(true);
                                            if (onQuestItemFound) {
                                                onQuestItemFound(building.questItemId, building.questItemName);
                                            }
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        fontWeight: 'bold',
                                        letterSpacing: '1px'
                                    }}
                                >
                                    Search the {building.buildingType || 'Building'}
                                </button>
                            </div>
                        )}

                        {/* Quest Item Found */}
                        {itemFound && searchResult && (
                            <div className="modal-section" style={{
                                backgroundColor: 'rgba(50, 180, 80, 0.1)',
                                padding: '20px',
                                borderRadius: '10px',
                                border: '2px solid rgba(50, 180, 80, 0.6)',
                                marginTop: '15px',
                                textAlign: 'center'
                            }}>
                                <h4 style={{
                                    margin: '0 0 10px 0',
                                    color: 'rgba(50, 180, 80, 1)',
                                    fontFamily: 'var(--header-font)'
                                }}>
                                    Item Found!
                                </h4>
                                <p style={{ margin: '0 0 8px 0', fontFamily: 'var(--body-font)' }}>
                                    <strong>Roll: {searchResult.roll} + {searchResult.modifier} = {searchResult.total}</strong> (needed {searchResult.dc})
                                </p>
                                <p style={{ margin: 0, fontFamily: 'var(--body-font)', fontSize: '1.1rem' }}>
                                    You discovered <strong style={{ color: 'var(--primary)' }}>{building.questItemName || 'a quest item'}</strong>!
                                </p>
                            </div>
                        )}

                        {/* Rest Section - for inns and taverns */}
                        {canRest && onRest && !restResult && (
                            <div className="modal-section" style={{
                                backgroundColor: 'rgba(0,0,0,0.03)',
                                padding: '20px',
                                borderRadius: '10px',
                                border: '1px solid var(--border)',
                                marginTop: '15px'
                            }}>
                                <h4 style={{
                                    borderBottom: '2px solid var(--primary)',
                                    paddingBottom: '10px',
                                    margin: '0 0 15px 0',
                                    color: 'var(--primary)',
                                    fontFamily: 'var(--header-font)'
                                }}>
                                    {restType === 'long' ? 'Rest at the Inn' : 'Take a Breather'}
                                </h4>
                                <p style={{
                                    margin: '0 0 15px 0',
                                    color: 'var(--text-secondary)',
                                    fontFamily: 'var(--body-font)',
                                    fontSize: '0.9rem'
                                }}>
                                    {restType === 'long'
                                        ? 'A warm bed and a good night\'s sleep will fully restore your party\'s health.'
                                        : 'A hot meal and a stiff drink will restore some of your party\'s vigor.'}
                                </p>
                                {/* Party HP preview */}
                                {party && party.length > 0 && (
                                    <div style={{ marginBottom: '15px' }}>
                                        {party.filter(h => !h.isDefeated).map(hero => {
                                            const name = hero.heroName || hero.characterName || 'Unknown';
                                            const id = hero.heroId || hero.characterId || name;
                                            const hpStatus = getHPStatus(hero.currentHP, hero.maxHP);
                                            const pct = (hero.currentHP / hero.maxHP) * 100;
                                            return (
                                                <div key={id} style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    marginBottom: '6px',
                                                    fontSize: '0.85rem'
                                                }}>
                                                    <span style={{ width: '100px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                                                    <div style={{
                                                        flex: 1,
                                                        height: '10px',
                                                        background: 'var(--border)',
                                                        borderRadius: '5px',
                                                        overflow: 'hidden'
                                                    }}>
                                                        <div style={{
                                                            width: `${pct}%`,
                                                            height: '100%',
                                                            background: hpStatus.color,
                                                            borderRadius: '5px',
                                                            transition: 'width 0.3s ease'
                                                        }} />
                                                    </div>
                                                    <span style={{ color: hpStatus.color, fontWeight: 'bold', minWidth: '60px', textAlign: 'right' }}>
                                                        {hero.currentHP}/{hero.maxHP}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                <button
                                    className="primary-button"
                                    disabled={!partyNeedsHealing}
                                    onClick={() => {
                                        if (onRest) {
                                            const result = onRest(restType);
                                            if (result) setRestResult(result);
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        fontWeight: 'bold',
                                        letterSpacing: '1px',
                                        opacity: partyNeedsHealing ? 1 : 0.5
                                    }}
                                >
                                    {partyNeedsHealing
                                        ? (restType === 'long' ? 'Rest (Full Heal)' : 'Rest (Heal 50%)')
                                        : 'Party is at full health'}
                                </button>
                            </div>
                        )}

                        {/* Rest Result */}
                        {restResult && (
                            <div className="modal-section" style={{
                                backgroundColor: 'rgba(39, 174, 96, 0.1)',
                                padding: '20px',
                                borderRadius: '10px',
                                border: '2px solid rgba(39, 174, 96, 0.5)',
                                marginTop: '15px'
                            }}>
                                <h4 style={{
                                    margin: '0 0 15px 0',
                                    color: '#27ae60',
                                    fontFamily: 'var(--header-font)',
                                    textAlign: 'center'
                                }}>
                                    {restResult.restType === 'long' ? 'Well Rested!' : 'Feeling Refreshed!'}
                                </h4>
                                {restResult.healingResults.map(hr => {
                                    const healed = hr.after - hr.before;
                                    return (
                                        <div key={hr.name} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '10px',
                                            marginBottom: '6px',
                                            fontSize: '0.85rem'
                                        }}>
                                            <span style={{ width: '100px', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hr.name}</span>
                                            <div style={{
                                                flex: 1,
                                                height: '10px',
                                                background: 'var(--border)',
                                                borderRadius: '5px',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{
                                                    width: `${(hr.after / hr.maxHP) * 100}%`,
                                                    height: '100%',
                                                    background: '#27ae60',
                                                    borderRadius: '5px',
                                                    transition: 'width 0.5s ease'
                                                }} />
                                            </div>
                                            <span style={{ color: '#27ae60', fontWeight: 'bold', minWidth: '90px', textAlign: 'right' }}>
                                                {hr.before} → {hr.after}
                                                {healed > 0 && <span style={{ color: '#27ae60', fontSize: '0.8rem' }}> (+{healed})</span>}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <button
                            className="secondary-button"
                            onClick={onClose}
                            style={{
                                width: '100%',
                                marginTop: '25px',
                                padding: '14px',
                                fontWeight: 'bold',
                                letterSpacing: '2px',
                                fontSize: '1rem'
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>

            {/* Image Lightbox Modal */}
            {isLightboxOpen && !imageError && (
                <div
                    className="modal-overlay lightbox-overlay"
                    onClick={toggleLightbox}
                    style={{
                        zIndex: 3000,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'zoom-out'
                    }}
                >
                    <div
                        style={{
                            position: 'relative',
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            onClick={toggleLightbox}
                            style={{
                                position: 'absolute',
                                top: '-40px',
                                right: '-40px',
                                background: 'none',
                                border: 'none',
                                color: 'white',
                                fontSize: '32px',
                                cursor: 'pointer',
                                padding: '10px',
                                lineHeight: '1'
                            }}
                            aria-label="Close lightbox"
                        >
                            ✕
                        </button>
                        <img
                            src={imageSrc}
                            alt={building.buildingType}
                            style={{
                                maxWidth: '100%',
                                maxHeight: '85vh',
                                borderRadius: '8px',
                                border: '2px solid var(--primary)',
                                boxShadow: '0 0 30px rgba(0,0,0,0.8)'
                            }}
                        />
                        <div style={{
                            marginTop: '15px',
                            color: 'white',
                            fontFamily: 'var(--header-font)',
                            fontSize: '1.2rem',
                            letterSpacing: '1px',
                            textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                        }}>
                            {building.buildingName || building.buildingType.charAt(0).toUpperCase() + building.buildingType.slice(1)}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default BuildingModal;
