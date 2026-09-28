import type { Metadata } from 'next';
import FinanceApp from '@/features/finance/app';
export const metadata:Metadata={title:'Agregar gasto · Clara',manifest:'/gasto/manifest.webmanifest',appleWebApp:{capable:true,title:'Agregar gasto',statusBarStyle:'default'}};
export default function ExpensePage(){return <FinanceApp initialExpense/>;}
