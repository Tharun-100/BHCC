
import { Department, User } from './types';

export const CLINIC_NAME = "Bhaktivedanta Health Care Center";
export const CLINIC_ADDRESS = "ISKCON Newtown, Near Shapoorji Bus Terminus, Ekajul, Action Area III, Newtown, Kolkata, Hudarait, West Bengal 700135";
export const CLINIC_PHONE = "+91 9948434604";
export const CLINIC_EMAIL = "vuttipallytharun17@gmail.com";

export const DEPARTMENTS: Department[] = [
  { id: '1', name: 'Ophthalmology', icon: 'Eye', description: 'Doctor consultations for eye health, vision concerns, and related conditions.', baseFee: 0 },
  { id: '2', name: 'Dental', icon: 'Smile', description: 'Doctor consultations for oral health, teeth, and gum-related concerns.', baseFee: 0 },
  { id: '3', name: 'Cardiology', icon: 'HeartPulse', description: 'Doctor consultations for heart health and cardiovascular concerns.', baseFee: 0 },
  { id: '4', name: 'Gynecology', icon: 'Venus', description: "Doctor consultations focused on women's reproductive and general health.", baseFee: 0 },
  { id: '5', name: 'Obstetrics', icon: 'Baby', description: 'Doctor consultations supporting pregnancy and maternal health.', baseFee: 0 },
];

export const mergeCurrentDepartments = (departments: Department[]): Department[] =>
  DEPARTMENTS.map((service) =>
    departments.find((department) => department.name.toLowerCase() === service.name.toLowerCase()) || service
  );

export const isCurrentService = (departmentName?: string): boolean =>
  Boolean(departmentName && DEPARTMENTS.some((service) => service.name.toLowerCase() === departmentName.toLowerCase()));

export const PRABHUPADA_BOOK_LISTS = {
  small: [
    'Beyond Birth and Death',
    'Easy Journey to Other Planets',
    'Elevation to Krishna Consciousness',
    'Kṛṣṇa Consciousness: The Topmost Yoga System',
    'On the Way to Kṛṣṇa',
    'The Perfection of Yoga',
    'Rāja-Vidyā: The King of Knowledge',
    'The Matchless Gift',
    'Kṛṣṇa: The Reservoir of Pleasure',
    'Perfect Questions, Perfect Answers',
    'The Laws of Nature',
    'Coming Back',
    'Chant and Be Happy',
    'Message of Godhead',
    'Mukunda-mālā-stotra',
    'Dharma: The Way of Transcendence'
  ],
  medium: [
    'Bhagavad-gītā As It Is',
    'Śrī Īśopaniṣad',
    'The Nectar of Instruction',
    'Teachings of Lord Caitanya',
    'Teachings of Lord Kapila',
    'Teachings of Queen Kuntī',
    'Transcendental Teachings of Prahlāda Mahārāja',
    'A Second Chance',
    'Life Comes from Life',
    'Civilization and Transcendence',
    'The Science of Self-Realization',
    'The Journey of Self-Discovery',
    'Renunciation Through Wisdom',
    'Beyond Illusion and Doubt'
  ],
  big: [
    'Kṛṣṇa Book / Kṛṣṇa, the Supreme Personality of Godhead',
    'The Nectar of Devotion',
    'Śrīmad-Bhāgavatam',
    'Sri Caitanya-caritāmṛta'
  ]
} as const;

export const DOCTORS: User[] = [];
